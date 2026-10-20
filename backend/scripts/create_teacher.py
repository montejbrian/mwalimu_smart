"""
MwalimuSmart Institutional OS
scripts/create_teacher.py — Add a teacher account

Usage:
    python -m scripts.create_teacher \
        --school_id 00000000-0000-0000-0000-000000000001 \
        --name "Mr. Kamau Njoroge" \
        --email kamau@school.sc.ke \
        --password SecurePass123 \
        --tsc TSC/0005678 \
        --strand mathematics
"""
from __future__ import annotations
import argparse, uuid, sys
import bcrypt, psycopg2
from config.settings import settings

def create_teacher(school_id, name, email, password, tsc=None, strand=None):
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()
    teacher_id = str(uuid.uuid4())
    conn = psycopg2.connect(settings.POSTGRES_DSN)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO teachers
                   (teacher_id,school_id,full_name,email,password_hash,tsc_number,strand)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (teacher_id, school_id, name, email.lower(), pw_hash, tsc, strand)
            )
        conn.commit()
        print(f"\n✓ Teacher created")
        print(f"  ID     : {teacher_id}")
        print(f"  Name   : {name}")
        print(f"  Email  : {email.lower()}")
        print(f"  School : {school_id}\n")
    except psycopg2.errors.UniqueViolation:
        print(f"✗ Error: Email {email} already exists.")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--school_id", required=True)
    p.add_argument("--name",      required=True)
    p.add_argument("--email",     required=True)
    p.add_argument("--password",  required=True)
    p.add_argument("--tsc",       default=None)
    p.add_argument("--strand",    default=None)
    a = p.parse_args()
    create_teacher(a.school_id, a.name, a.email, a.password, a.tsc, a.strand)
