"""
RAG-based Internship Application Email Generator
==================================================

Pipeline:
  Phase 1 - Data Ingestion & Embedding: chunk the personal CV/context markdown
            file and embed it into a local, persistent ChromaDB vector store
            using a HuggingFace sentence-transformers model.
  Phase 2 - Dynamic Web Scraping: pull the live text content of a target
            company / lab / career page with LangChain's WebBaseLoader.
  Phase 3 - Retrieval & Generation: run a similarity search against the CV
            vector store using the scraped page as the query, then feed the
            retrieved CV chunks + target page content into an LLM through a
            strict PromptTemplate / LCEL chain to draft a cover email.

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
# Phase 2: Dynamic Web Scraping
# --------------------------------------------------------------------------- #

def scrape_target_page(url: str, max_chars: int = 6000) -> str:
    """Fetch and lightly clean the live text content of the target page."""
    print(f"[Phase 2] Scraping target page: {url}")
    loader = WebBaseLoader(url, bs_get_text_kwargs={"separator": " ", "strip": True})
    docs = loader.load()

    text = "\n".join(d.page_content for d in docs)
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]
    cleaned = "\n".join(lines)

    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars]

    if not cleaned.strip():
        raise RuntimeError(
            "Scraped page returned no usable text content. "
            "The site may require JavaScript rendering or block scrapers."
        )

    print(f"[Phase 2] Retrieved {len(cleaned)} characters of target content.")
    return cleaned


# --------------------------------------------------------------------------- #
# Phase 3: Retrieval & Generation
# --------------------------------------------------------------------------- #
 
EMAIL_PROMPT = PromptTemplate(
    input_variables=["target_context", "cv_context", "role", "contact_info"],
    template="""You are an experienced technical hiring manager who also happens
to write outstanding application emails. You are helping a Computer Engineering
student draft a SHORT, high-signal summer internship application email —
the kind that actually makes a hiring manager want to reply, not a generic
cover letter.

CRITICAL RULES (must never be violated):
1. You may ONLY use facts, skills, and technologies that appear verbatim in the
   "CANDIDATE FACTS" section below. NEVER invent, assume, or exaggerate.
2. DO NOT mention specific project names or titles from CANDIDATE FACTS. Instead,
   focus entirely on the core technologies you used, the technical concepts you
   mastered, and the domain knowledge you acquired (e.g., discuss implementing
   AI models or building full-stack systems conceptually).
3. The email MUST start with a professional greeting (e.g., "Dear Hiring Committee,"
   or "Dear [Team/Lab Name],").
4. You MUST explicitly state that you are applying for a "summer internship".
5. You MUST include this exact logistical detail near the closing of the email: 
   "Please note that my mandatory internship insurance will be fully covered by my university."
6. Do not invent the name of a hiring manager, a specific team, or any detail
   about the target organization that is not present in "TARGET CONTEXT".
7. The email signature MUST use the exact name, email, phone, LinkedIn, and
   GitHub given in "CONTACT INFO" below, verbatim. NEVER write a placeholder
   like "[Your Name]". Include all of them in the sign-off, each on its own line.
8. Output ONLY the email (with a subject line), no extra commentary.

CONTENT PRIORITY (this is what makes the email good, follow it strictly):
- Lead with ONE specific, concrete reason their exact work/research (drawn only 
  from TARGET CONTEXT) aligns with your interests. Show genuine curiosity and 
  enthusiasm for their ongoing studies.
- Highlight the MOST RELEVANT technical concepts and frameworks you know (from 
  CANDIDATE FACTS) that match the target's field. Explain what you built conceptually 
  to prove your competence, without dropping project names.
- Include one genuine, specific sentence demonstrating what you want to LEARN 
  from their team's specific expertise. Be curious and specific to their domain, 
  not a vague "eager to learn" line.
- Certificates, GPA, and course/workshop names are LOW priority. Cut anything 
  that does not serve the points above.

STYLE:
- Total length: 130-180 words for the body (excluding subject line and
  signature). Shorter and sharper beats longer and thorough.
- Plain, direct, confident sentences. No filler phrases like "I believe I can
  contribute and learn" or similar generic cover-letter boilerplate.
- Structure: A formal greeting, no more than 3 short paragraphs, a brief closing 
  line (including the insurance note), and the signature.

TARGET CONTEXT (scraped live from the target organization's page):
---
{target_context}
---

CANDIDATE FACTS (retrieved from the candidate's verified CV/background,
top {top_k} most relevant chunks):
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
subject line formatted as: "Subject: ...".
""".replace("{top_k}", str(TOP_K)),
)
 

def format_retrieved_docs(docs) -> str:
    return "\n\n".join(f"[CV Chunk {i+1}]\n{d.page_content}" for i, d in enumerate(docs))


def build_generation_chain(vectordb: Chroma, role: str, contact_info_text: str):
    """LCEL chain: scraped_text -> retrieve CV chunks -> prompt -> LLM -> str."""
    retriever = vectordb.as_retriever(
        search_type="mmr",
        search_kwargs={"k": TOP_K, "fetch_k": 12, "lambda_mult": 0.6},
    )
    llm = ChatGroq(model=LLM_MODEL, temperature=0.4)

    chain = (
        {
            "target_context": RunnablePassthrough(),
            "cv_context": retriever | RunnableLambda(format_retrieved_docs),
            "role": RunnableLambda(lambda _: role or "Not specified"),
            "contact_info": RunnableLambda(lambda _: contact_info_text),
        }
        | EMAIL_PROMPT
        | llm
        | StrOutputParser()
    )
    return chain


def generate_email(url: str, role: str, persist_dir: str = PERSIST_DIR) -> str:
    scraped_text = scrape_target_page(url)
    vectordb = load_vectordb(persist_dir)

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

    print(f"[Phase 3] Retrieving top {TOP_K} relevant CV chunks and generating email...")
    chain = build_generation_chain(vectordb, role, contact_info_text)
    email = chain.invoke(scraped_text)
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