"""Sports OMS admin commands: bootstrap-core | import-workbook FILE"""
import argparse, getpass, os, sys
from .importer import run_import
from .models import SessionLocal, User, ensure_schema
from .security import hash_pw
from .services import audit

def bootstrap(a):
    ensure_schema(); db = SessionLocal()
    if db.query(User).filter_by(role="CORE").first(): sys.exit("A CORE account already exists.")
    pw = os.getenv("BOOTSTRAP_PASSWORD") or getpass.getpass("Password (min 12 chars): ")
    if len(pw) < 12: sys.exit("Password too short.")
    u = User(email=a.email.lower(), name=a.name, role="CORE", pw_hash=hash_pw(pw)); db.add(u); db.flush(); audit(db, "cli", "bootstrap.core", "user", u.id); db.commit(); print("CORE account created:", u.email)

def importer(a):
    ensure_schema(); db = SessionLocal(); rep = run_import(db, open(a.file, "rb").read())
    audit(db, "cli", "import.workbook", "import", None, None, {"new": rep["new"], "existing": rep["existing"], "errors": len(rep["errors"]), "file": os.path.basename(a.file)}); db.commit()
    print("created:", rep["new"], "already present:", rep["existing"])
    for e in rep["errors"] + [{"warning": w} for w in rep["warnings"]]: print(e)

if __name__ == "__main__":
    p = argparse.ArgumentParser(); sp = p.add_subparsers(dest="c", required=True)
    b = sp.add_parser("bootstrap-core"); b.add_argument("--email", required=True); b.add_argument("--name", required=True); b.set_defaults(f=bootstrap)
    i = sp.add_parser("import-workbook"); i.add_argument("file"); i.set_defaults(f=importer)
    a = p.parse_args(); a.f(a)
