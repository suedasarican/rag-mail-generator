"""
RAG-based Internship Application Email Generator
==================================================

Pipeline:
  Phase 1 - Data Ingestion & Embedding: chunk the personal CV/context markdown
            file and embed it into a local, persistent ChromaDB vector store
            using a HuggingFace sentence-transformers model.
  Phase 2 - Dynamic Web Scraping & Chunking: pull the live text content of
            a target company / lab / career page with LangChain's
            WebBaseLoader, then split it into small (~500-char) Documents
            with RecursiveCharacterTextSplitter so each section of the page
            (Requirements, Research Areas, etc.) gets its own embedding.
  Phase 3 - Dual Retrieval & Generation: for each target chunk, run a
            similarity_search_with_score against the CV ChromaDB; keep only
            the chunks whose best match score falls below MATCH_THRESHOLD
            (irrelevant sections like Cookie Policy are discarded).
            Aggregate and deduplicate the matched CV chunks, then feed the
            LLM only the matched target segments and matched CV facts.

CRITICAL RULE enforced in the prompt: the model must ONLY use the retrieved
CV chunks as ground truth about the candidate. It is explicitly instructed
never to invent, exaggerate, or infer skills/experience that are not present
in the retrieved context.

Usage
-----
    # one-time / whenever your CV context changes
    python main.py ingest --file cv_context.md

    # for every new application target
    python main.py generate --url "https://example-lab.edu/careers" \
        --role "Summer Research Intern" \
        --output emails/example_lab.txt

Environment
-----------
    OPENAI_API_KEY must be set (e.g. in a .env file, see .env.example).

Dependencies (see requirements.txt)
------------------------------------
    langchain, langchain-core, langchain-community, langchain-text-splitters,
    langchain-huggingface, langchain-chroma, langchain-openai,
    chromadb, sentence-transformers, beautifulsoup4, python-dotenv
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnableLambda, RunnablePassthrough
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import TextLoader, WebBaseLoader
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_groq import ChatGroq

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

PERSIST_DIR = "./chroma_db"
COLLECTION_NAME = "cv_context"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
LLM_MODEL = "llama-3.3-70b-versatile"
TOP_K = 5
CHUNK_SIZE = 500
CHUNK_OVERLAP = 75

# Dual-retrieval (chunk-to-chunk cross-matching) configuration
TARGET_CHUNK_SIZE    = 500   # chunk size when splitting the scraped target page
TARGET_CHUNK_OVERLAP = 50    # overlap between consecutive target page chunks
MATCH_THRESHOLD      = 0.45  # L2 distance ceiling — a target chunk is relevant
                              # only if its best CV match score < this value
MAX_CV_CHUNKS        = 8     # max deduplicated CV chunks forwarded to the LLM
MAX_TARGET_CHUNKS    = 6     # max matched target chunks forwarded to the LLM

# A generic user-agent for WebBaseLoader / urllib so requests aren't blocked
os.environ.setdefault(
    "USER_AGENT",
    "Mozilla/5.0 (compatible; InternshipEmailBot/1.0; +https://github.com/suedasarican)",
)


# --------------------------------------------------------------------------- #
# Phase 1: Data Ingestion & Embedding
# --------------------------------------------------------------------------- #
 
def get_embeddings() -> HuggingFaceEmbeddings:
    """Local, free, open-source embedding model (no API key required)."""
    return HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )
 
 
def split_cv_by_sections_and_items(documents) -> list:
    """
    CV-aware chunking: instead of blindly splitting by character count
    (which can cut a project description in half), this splits the markdown
    by section headers (lines ending with ':') and, within each section,
    by top-level bullet items ('* '). Each bullet becomes its own chunk so a
    single project/certificate/education entry is never fragmented across
    two chunks. The section name is prefixed onto each chunk's text so the
    embedding model has that context too (e.g. "Projeler ve Yarışmalar: ...").
    Non-bulleted sections (like "Profil") are kept as a single chunk.
    Falls back to RecursiveCharacterTextSplitter only for any leftover
    section that turns out to be unexpectedly long with no bullets.
    """
    from langchain_core.documents import Document
 
    fallback_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
    )
 
    chunks: list[Document] = []
 
    for doc in documents:
        text = doc.page_content
        lines = text.splitlines()
 
        current_section = "Genel Bilgiler"
        section_intro_lines: list[str] = []
        current_items: list[str] = []
 
        def flush_section():
            """Emit whatever has been buffered for the current section."""
            nonlocal section_intro_lines, current_items
            if section_intro_lines:
                intro_text = "\n".join(section_intro_lines).strip()
                if intro_text:
                    chunks.append(
                        Document(
                            page_content=f"{current_section}:\n{intro_text}",
                            metadata=dict(doc.metadata),
                        )
                    )
            for item in current_items:
                item_text = f"{current_section}:\n* {item.strip()}"
                if len(item_text) > CHUNK_SIZE * 2:
                    # Unusually long bullet: fall back to character splitting
                    # for just this one item so no single chunk gets huge.
                    for sub in fallback_splitter.split_text(item_text):
                        chunks.append(Document(page_content=sub, metadata=dict(doc.metadata)))
                else:
                    chunks.append(Document(page_content=item_text, metadata=dict(doc.metadata)))
            section_intro_lines = []
            current_items = []
 
        for raw_line in lines:
            line = raw_line.rstrip()
            stripped = line.strip()
 
            if not stripped:
                continue
 
            # Heuristic: a short line ending in ':' with no bullet marker is
            # treated as a new section header (e.g. "Eğitim:", "Beceriler:").
            is_header = (
                stripped.endswith(":")
                and not stripped.startswith("*")
                and len(stripped) < 60
            )
 
            if is_header:
                flush_section()
                current_section = stripped.rstrip(":")
                continue
 
            if stripped.startswith("*"):
                current_items.append(stripped.lstrip("*").strip())
            else:
                # Contact info / free-text lines before any header (name,
                # email, phone, links) or a wrapped continuation of a bullet.
                if current_items:
                    # continuation of the previous bullet (wrapped line)
                    current_items[-1] = f"{current_items[-1]} {stripped}"
                else:
                    section_intro_lines.append(stripped)
 
        flush_section()
 
    return chunks
 
 
def extract_contact_info(raw_text: str) -> dict:
    """
    Pull name/email/phone/LinkedIn/GitHub straight out of the raw CV text via
    regex, independent of chunking or retrieval. This information must always
    appear in the generated signature, so it should never depend on whether
    a similarity/MMR search happens to retrieve that particular chunk.
    """

    email_match = re.search(r"[\w\.\-]+@[\w\.\-]+\.\w+", raw_text)
    phone_match = re.search(r"(\+?\d[\d\s\-]{7,}\d)", raw_text)
    linkedin_match = re.search(r"linkedin\.com/\S+", raw_text, re.IGNORECASE)
    github_match = re.search(r"github\.com/\S+", raw_text, re.IGNORECASE)
 
    # Name: first non-empty line of the document (CV convention used here).
    first_line = next((l.strip() for l in raw_text.splitlines() if l.strip()), "")
 
    return {
        "name": first_line,
        "email": email_match.group(0) if email_match else "",
        "phone": phone_match.group(0).strip() if phone_match else "",
        "linkedin": linkedin_match.group(0).rstrip(".,)") if linkedin_match else "",
        "github": github_match.group(0).rstrip(".,)") if github_match else "",
    }
 
 
def contact_info_path(persist_dir: str) -> Path:
    return Path(persist_dir) / "contact_info.json"
 
 
def ingest_cv(cv_path: str, persist_dir: str = PERSIST_DIR) -> None:
    """Chunk the CV markdown file and (re)build the persistent Chroma index."""
    path = Path(cv_path)
    if not path.exists():
        raise FileNotFoundError(f"CV context file not found: {cv_path}")
 
    print(f"[Phase 1] Loading CV context from: {path}")
    loader = TextLoader(str(path), encoding="utf-8")
    documents = loader.load()
 
    chunks = split_cv_by_sections_and_items(documents)
    print(f"[Phase 1] Split CV into {len(chunks)} chunks (section/item-aware).")
 
    embeddings = get_embeddings()
 
    # Wipe any previous collection so re-running ingest doesn't duplicate data.
    if Path(persist_dir).exists():
        print(f"[Phase 1] Clearing previous vector store at: {persist_dir}")
        try:
            Chroma(
                collection_name=COLLECTION_NAME,
                embedding_function=embeddings,
                persist_directory=persist_dir,
            ).delete_collection()
        except Exception:
            pass  # nothing to delete yet
 
    vectordb = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        collection_name=COLLECTION_NAME,
        persist_directory=persist_dir,
    )
    print(f"[Phase 1] Vector store built and persisted at: {persist_dir}")
    print(f"[Phase 1] Indexed {vectordb._collection.count()} vectors.")
 
    # Save contact info separately so the signature is always correct,
    # regardless of what the similarity/MMR search happens to retrieve.
    Path(persist_dir).mkdir(parents=True, exist_ok=True)
    contact = extract_contact_info(documents[0].page_content)
 
    contact_info_path(persist_dir).write_text(
        json.dumps(contact, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"[Phase 1] Saved contact info for signature: {contact.get('name', '(name not found)')}")
 
 
def load_vectordb(persist_dir: str = PERSIST_DIR) -> Chroma:
    if not Path(persist_dir).exists():
        raise RuntimeError(
            "No vector store found. Run `python main.py ingest --file <cv.md>` first."
        )
    return Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=get_embeddings(),
        persist_directory=persist_dir,
    )

# --------------------------------------------------------------------------- #
# Phase 2: Dynamic Web Scraping & Chunking
# --------------------------------------------------------------------------- #

def scrape_and_chunk_target_page(url: str) -> list[Document]:
    """
    Fetch the live text of the target page and split it into small, focused
    Document chunks (~TARGET_CHUNK_SIZE chars each).

    Returning a list of Documents — rather than a single flat string — is the
    key architectural change: every section of the page (Requirements, Research
    Areas, Contact, etc.) now gets its own embedding, enabling the chunk-to-chunk
    cross-matching in Phase 3 to selectively keep only the relevant sections.
    """
    print(f"[Phase 2] Scraping target page: {url}")
    loader = WebBaseLoader(url, bs_get_text_kwargs={"separator": " ", "strip": True})
    raw_docs = loader.load()

    # Light clean-up: collapse whitespace runs and drop empty lines.
    cleaned_docs: list[Document] = []
    for doc in raw_docs:
        lines = [
            re.sub(r"\s+", " ", line).strip()
            for line in doc.page_content.splitlines()
            if line.strip()
        ]
        cleaned_text = "\n".join(lines)
        if cleaned_text.strip():
            cleaned_docs.append(
                Document(page_content=cleaned_text, metadata=doc.metadata)
            )

    if not cleaned_docs:
        raise RuntimeError(
            "Scraped page returned no usable text content. "
            "The site may require JavaScript rendering or block scrapers."
        )

    # Split the cleaned page into small, focused chunks. Each chunk represents
    # one semantic segment of the page and will be individually cross-matched
    # against the CV vector store in Phase 3.
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=TARGET_CHUNK_SIZE,
        chunk_overlap=TARGET_CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    target_chunks = splitter.split_documents(cleaned_docs)

    total_chars = sum(len(c.page_content) for c in target_chunks)
    print(
        f"[Phase 2] Produced {len(target_chunks)} target chunks "
        f"({total_chars} total chars) ready for cross-matching."
    )
    return target_chunks


# --------------------------------------------------------------------------- #
# Phase 3: Retrieval & Generation — Agentic Routing
# --------------------------------------------------------------------------- #

# ── Shared building blocks ───────────────────────────────────────────────────
# These text blocks are reused verbatim across every persona prompt so that
# the rules and context-injection logic stay in one place.

_CRITICAL_RULES = """\
CRITICAL RULES (must never be violated):
1. You may ONLY use facts, skills, and technologies that appear verbatim in the
   "CANDIDATE FACTS" section below. NEVER invent, assume, or exaggerate.
2. You MUST prioritize AI-related projects and competitions (e.g., TEKNOFEST).
   You MAY mention specific project and competition names briefly to provide
   concrete evidence of your skills. Name the models and the problem solved
   (e.g., XGBoost for imbalanced classification) if present in CANDIDATE FACTS.
3. The email MUST start with a professional greeting (e.g., "Dear Hiring Committee,"
   or "Dear [Team/Lab Name],").
4. You MUST explicitly state that you are applying for a "summer internship".
5. You MUST include this exact sentence near the closing of the email:
   "Please note that my mandatory internship insurance will be fully covered by my university."
6. Do not invent the name of a hiring manager, a specific team, or any detail
   about the target organization that is not present in "TARGET CONTEXT".
7. The email signature MUST use the exact name, email, phone, LinkedIn, and
   GitHub given in "CONTACT INFO" below, verbatim. NEVER write a placeholder
   like "[Your Name]". Include all of them in the sign-off, each on its own line.
8. Output ONLY the email (with a subject line), no extra commentary."""

_CONTEXT_BLOCK = """\
TARGET CONTEXT (only the sections of the target page that matched the
candidate's background — irrelevant sections have been filtered out):
---
{target_context}
---

CANDIDATE FACTS (retrieved from the candidate's verified CV/background —
only the chunks that matched the target page's content):
---
{cv_context}
---

CONTACT INFO (use verbatim in the signature, every time, no exceptions):
---
{contact_info}
---

TARGET ROLE (if provided by the user, otherwise infer cautiously from the
target context without fabricating specifics): {role}

Write the complete application email now, in English, starting with a
subject line formatted as: "Subject: ..."."""

# ── Step 1: Classifier prompt ────────────────────────────────────────────────

ROUTER_PROMPT = PromptTemplate(
    input_variables=["target_context"],
    template="""You are an expert corporate analyst. Read the following text
scrapped from a target organization's website and classify the organization
into EXACTLY ONE of the following three categories:

1. ACADEMIC  : University labs, research centers, scientific institutes,
               academia-adjacent non-profits.
2. STARTUP   : Fast-paced tech startups, software houses, e-commerce platforms,
               early-to-mid-stage product companies.
3. CORPORATE : Large enterprises, defense industry, aerospace, government
               contractors, robust engineering firms.

Output ONLY the category name (ACADEMIC, STARTUP, or CORPORATE).
No other text, no punctuation, no explanation.

TARGET CONTEXT:
{target_context}""",
)

# ── Step 2: Three persona-specific generation prompts ────────────────────────

ACADEMIC_PROMPT = PromptTemplate(
    input_variables=["target_context", "cv_context", "role", "contact_info"],
    template=f"""You are an experienced academic hiring coordinator helping a
Computer Engineering student draft a high-signal summer internship application
email for a university lab or research centre.

{_CRITICAL_RULES}

CONTENT PRIORITY (ACADEMIC LAB FOCUS — follow strictly):
- Open with ONE specific reason their published research or lab focus (from
  TARGET CONTEXT) intersects with your own interests — show you actually read
  their work, not just their homepage.
- Emphasise your research-oriented skills: algorithm design, ML model
  experimentation (e.g., CTGAN for class-imbalance, deep-learning pipelines),
  data analysis, and methodical problem-solving.
- If relevant, briefly name a specific competition or project (e.g., TEKNOFEST)
  to anchor your technical claims to concrete outcomes.
- Close with ONE genuine sentence about what you want to learn from this lab's
  specific domain expertise — be precise, not vague.
- Certificates, GPA, and workshop names are LOW priority unless directly
  relevant to the lab's research.

STYLE:
- 180-230 words for the body (excluding subject line and signature).
- Scholarly, respectful, and deeply curious tone.
- 3-4 focused paragraphs; formal greeting; brief closing with the insurance note.

{_CONTEXT_BLOCK}""",
)

STARTUP_PROMPT = PromptTemplate(
    input_variables=["target_context", "cv_context", "role", "contact_info"],
    template=f"""You are a seasoned startup recruiter helping a Computer
Engineering student draft a high-signal summer internship application email
for a fast-paced tech startup or software house.

{_CRITICAL_RULES}

CONTENT PRIORITY (STARTUP FOCUS — follow strictly):
- Lead with ONE specific reason their product, stack, or market focus (from
  TARGET CONTEXT) excites you — make it concrete, not generic enthusiasm.
- Highlight your ability to ship: full-stack development (React, ASP.NET Core),
  database design, end-to-end system integration, and real-world project impact.
- Frame the 42 Piscine / 42 Istanbul experience (if present in CANDIDATE FACTS)
  as proof of rapid learning, self-direction, and grit under pressure.
- Mention any AI/ML work (e.g., TEKNOFEST competitions) to show you bring
  more than just CRUD skills.
- Close with ONE sentence about what you want to build or learn alongside
  their specific team — keep it product-focused.
- Certificates, GPA, and course names are LOW priority.

STYLE:
- 180-230 words for the body (excluding subject line and signature).
- Energetic, action-oriented, direct, and concise tone — no fluff.
- 3-4 tight paragraphs; strong opening; brief closing with the insurance note.

{_CONTEXT_BLOCK}""",
)

CORPORATE_PROMPT = PromptTemplate(
    input_variables=["target_context", "cv_context", "role", "contact_info"],
    template=f"""You are a senior technical recruiter at a large engineering
firm helping a Computer Engineering student draft a high-signal summer
internship application email for a corporate, defense, or aerospace employer.

{_CRITICAL_RULES}

CONTENT PRIORITY (CORPORATE / DEFENSE / AEROSPACE FOCUS — follow strictly):
- Open with ONE specific reason their engineering domain or ongoing programme
  (from TARGET CONTEXT) aligns with your skills — reference their actual work.
- Emphasise scale, reliability, and rigorous engineering: highlight specific
  ML models used in high-stakes contexts (XGBoost, deep-learning pipelines
  tuned for variance/overfitting) and any competition results (TEKNOFEST).
- Explicitly reference the 42 Piscine / 42 Istanbul experience (if present in
  CANDIDATE FACTS): frame it as proof of strong C/C++ foundational skills,
  Linux environments, and software-engineering discipline.
- Highlight any relevant autonomous-systems, embedded, or low-level programming
  experience from CANDIDATE FACTS.
- Close with ONE sentence about the specific technical expertise you want to
  develop within their engineering environment.
- Certificates, GPA, and workshop names are LOW priority.

STYLE:
- 180-230 words for the body (excluding subject line and signature).
- Highly formal, structured, and engineering-driven tone — precise language.
- 3-4 substantive paragraphs; formal greeting; brief closing with insurance note.

{_CONTEXT_BLOCK}""",
)


def format_target_chunks(chunks: list[Document]) -> str:
    """Format matched target-page chunks for the LLM prompt."""
    return "\n\n".join(
        f"[Target Chunk {i+1}]\n{c.page_content}" for i, c in enumerate(chunks)
    )


def format_cv_chunks(chunks: list[Document]) -> str:
    """Format matched CV chunks for the LLM prompt."""
    return "\n\n".join(
        f"[CV Chunk {i+1}]\n{c.page_content}" for i, c in enumerate(chunks)
    )


def cross_match_chunks(
    target_chunks: list[Document],
    vectordb: Chroma,
) -> tuple[list[Document], list[Document]]:
    """
    Phase 3a — Chunk-to-Chunk Cross-Matching.

    Algorithm:
      For each target_chunk (a section of the scraped career/lab page):
        1. Run similarity_search_with_score against the CV vector store (k=3).
           Chroma returns (Document, L2_distance) pairs — LOWER score = CLOSER.
        2. If the best (minimum) score < MATCH_THRESHOLD, the target chunk is
           deemed relevant (e.g., "Requirements" matching a "Projects" CV chunk).
        3. Relevant target chunks are kept; irrelevant ones (Cookie Policy, legal
           text, navigation menus, etc.) are silently discarded.
        4. All CV chunks surfaced by matched target chunks are pooled and
           deduplicated by page_content, preserving insertion order.

    Fallback: if zero target chunks pass the threshold (very sparse page or
    too strict a threshold), the 3 closest target chunks are used instead and
    a warning is printed so you can lower MATCH_THRESHOLD.

    Returns:
        matched_target_chunks : target page segments aligned with the CV
        deduplicated_cv_chunks: unique CV chunks matched by ≥1 target chunk
    """
    matched_target_chunks: list[Document] = []
    # Dict keyed on page_content to deduplicate while preserving insertion order.
    cv_chunk_pool: dict[str, Document] = {}

    for t_chunk in target_chunks:
        query_text = t_chunk.page_content

        # Retrieve the top-3 CV chunks most similar to this target chunk.
        results = vectordb.similarity_search_with_score(query_text, k=3)

        if not results:
            continue

        # Lower L2 distance = better match. Keep the best (minimum) score.
        best_score = min(score for _, score in results)

        if best_score < MATCH_THRESHOLD:
            # This target chunk aligns with something real in the CV — keep it.
            matched_target_chunks.append(t_chunk)

            # Harvest all CV chunks from this match into the deduplication pool.
            for cv_doc, _ in results:
                key = cv_doc.page_content
                if key not in cv_chunk_pool:
                    cv_chunk_pool[key] = cv_doc

    # Enforce caps so the final prompt stays within a reasonable token budget.
    matched_target_chunks = matched_target_chunks[:MAX_TARGET_CHUNKS]
    deduplicated_cv_chunks = list(cv_chunk_pool.values())[:MAX_CV_CHUNKS]

    print(
        f"[Phase 3] Cross-match: {len(matched_target_chunks)}/{len(target_chunks)} "
        f"target chunks matched | {len(deduplicated_cv_chunks)} unique CV chunks collected."
    )

    # --- Fallback: threshold may be too strict for this particular page ---
    if not matched_target_chunks:
        print(
            f"[Phase 3] WARNING: No target chunks passed MATCH_THRESHOLD={MATCH_THRESHOLD}. "
            "Falling back to the 3 closest target chunks. Consider lowering the threshold."
        )
        # Score every target chunk and keep the 3 with the lowest distance.
        scored: list[tuple[Document, float]] = []
        for t_chunk in target_chunks:
            results = vectordb.similarity_search_with_score(t_chunk.page_content, k=1)
            if results:
                scored.append((t_chunk, results[0][1]))
        scored.sort(key=lambda x: x[1])
        matched_target_chunks = [c for c, _ in scored[:3]]

        # Refill the CV pool from the fallback chunks.
        for t_chunk in matched_target_chunks:
            for cv_doc, _ in vectordb.similarity_search_with_score(
                t_chunk.page_content, k=3
            ):
                key = cv_doc.page_content
                if key not in cv_chunk_pool:
                    cv_chunk_pool[key] = cv_doc
        deduplicated_cv_chunks = list(cv_chunk_pool.values())[:MAX_CV_CHUNKS]
        print(
            f"[Phase 3] Fallback: using {len(matched_target_chunks)} target chunks "
            f"and {len(deduplicated_cv_chunks)} CV chunks."
        )

    return matched_target_chunks, deduplicated_cv_chunks


def _route_to_prompt(category: str) -> PromptTemplate:
    """
    Return the persona-specific PromptTemplate that matches the classifier
    output. Defaults to ACADEMIC_PROMPT for any unrecognised category so
    the pipeline never hard-crashes.
    """
    cat = category.strip().upper()
    if "STARTUP" in cat:
        return STARTUP_PROMPT
    if "CORPORATE" in cat:
        return CORPORATE_PROMPT
    return ACADEMIC_PROMPT  # default / ACADEMIC


def build_generation_chain(role: str, contact_info_text: str):
    """
    2-step Agentic Routing chain.

    Step 1 — Classifier (ROUTER_PROMPT → LLM → str):
        A lightweight LLM call reads the pre-formatted target context and
        returns one of: ACADEMIC | STARTUP | CORPORATE.

    Step 2 — Persona generation (selected prompt → LLM → str):
        The matched persona prompt (ACADEMIC / STARTUP / CORPORATE) is
        invoked with the full inputs dict to draft the email.

    The chain input is a dict::
        {"target_context": str, "cv_context": str}
    """
    llm = ChatGroq(model=LLM_MODEL, temperature=0.4)

    # ── Step 1: classifier chain (runs first, cheap, low-temperature call) ──
    router_chain = ROUTER_PROMPT | llm | StrOutputParser()

    # ── Step 2: persona routing + generation ────────────────────────────────
    def route_and_generate(inputs: dict) -> str:
        """Classify the target culture, select the matching prompt, generate."""
        # Classify
        category = router_chain.invoke(
            {"target_context": inputs["target_context"]}
        ).strip().upper()
        print(f"\n[AI Agent] Target culture classified as: {category}")

        # Route to the right persona prompt
        selected_prompt = _route_to_prompt(category)

        # Build full inputs for the persona prompt
        full_inputs = {
            "target_context": inputs["target_context"],
            "cv_context":     inputs["cv_context"],
            "role":           role or "Not specified",
            "contact_info":   contact_info_text,
        }

        # Generate the email with the persona-specific prompt
        persona_chain = selected_prompt | llm | StrOutputParser()
        return persona_chain.invoke(full_inputs)

    return RunnableLambda(route_and_generate)


def generate_email(url: str, role: str, persist_dir: str = PERSIST_DIR) -> str:
    """
    Full pipeline orchestrator:
      Phase 2 → scrape & chunk the target page
      Phase 3a → cross-match chunks against the CV vector store
      Phase 3b → generate the email from matched context only
    """
    # --- Phase 2: scrape and chunk the target page ---
    target_chunks = scrape_and_chunk_target_page(url)

    vectordb = load_vectordb(persist_dir)

    # --- Load contact info (always needed for the email signature) ---
    contact_file = contact_info_path(persist_dir)
    if not contact_file.exists():
        raise RuntimeError(
            "No contact_info.json found. Re-run `python main.py ingest --file <cv.md>` "
            "(this is expected once after upgrading to this version)."
        )
    contact = json.loads(contact_file.read_text(encoding="utf-8"))
    contact_lines = [
        f"Name: {contact.get('name', '')}",
        f"Email: {contact.get('email', '')}",
        f"Phone: {contact.get('phone', '')}",
        f"LinkedIn: {contact.get('linkedin', '')}",
        f"GitHub: {contact.get('github', '')}",
    ]
    contact_info_text = "\n".join(l for l in contact_lines if l.split(": ", 1)[1])

    # --- Phase 3a: cross-match each target chunk against the CV vector store ---
    matched_targets, matched_cv = cross_match_chunks(target_chunks, vectordb)

    # --- Phase 3b: generate the email from matched context only ---
    print(
        f"[Phase 3] Generating email with "
        f"{len(matched_targets)} target chunk(s) + {len(matched_cv)} CV chunk(s)..."
    )
    chain = build_generation_chain(role, contact_info_text)
    email = chain.invoke({
        "target_context": format_target_chunks(matched_targets),
        "cv_context":     format_cv_chunks(matched_cv),
    })
    return email


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def main() -> None:
    load_dotenv()  # picks up OPENAI_API_KEY from a local .env file if present

    parser = argparse.ArgumentParser(
        description="RAG pipeline for personalized internship application emails."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest_p = subparsers.add_parser("ingest", help="Build/refresh the CV vector store.")
    ingest_p.add_argument("--file", required=True, help="Path to your CV/context markdown file.")
    ingest_p.add_argument("--persist-dir", default=PERSIST_DIR, help="Where to store the Chroma DB.")

    gen_p = subparsers.add_parser("generate", help="Scrape a target page and generate an email.")
    gen_p.add_argument("--url", required=True, help="Target company/lab/career page URL.")
    gen_p.add_argument("--role", default="", help="Optional: the specific role/position title.")
    gen_p.add_argument("--persist-dir", default=PERSIST_DIR, help="Path to the existing Chroma DB.")
    gen_p.add_argument("--output", default=None, help="Optional path to save the generated email as .txt")

    args = parser.parse_args()

    if not os.getenv("GROQ_API_KEY") and args.command == "generate":
        print(
            "ERROR: GROQ_API_KEY is not set. Add it to a .env file "
            "(see .env.example) or export it in your shell.",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.command == "ingest":
        ingest_cv(args.file, args.persist_dir)

    elif args.command == "generate":
        email = generate_email(args.url, args.role, args.persist_dir)
        print("\n" + "=" * 70)
        print(email)
        print("=" * 70 + "\n")

        if args.output:
            out_path = Path(args.output)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(email, encoding="utf-8")
            print(f"[Done] Email saved to: {out_path}")


if __name__ == "__main__":
    main()