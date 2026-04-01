from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
import os
import pdfplumber
from docx import Document

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

DB_CONFIG = {
    "host": "localhost",
    "database": "resume_match_db",
    "user": "postgres",
    "password": "your_password_here"
}

def get_connection():
    return psycopg2.connect(**DB_CONFIG)

def extract_text_from_pdf(file_path):
    text = ""
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text

def extract_text_from_docx(file_path):
    doc = Document(file_path)
    text = []
    for para in doc.paragraphs:
        text.append(para.text)
    return "\n".join(text)

def extract_text(file_path, file_type):
    file_type = file_type.lower()
    if file_type == "pdf":
        return extract_text_from_pdf(file_path)
    elif file_type == "docx":
        return extract_text_from_docx(file_path)
    else:
        return ""

def extract_skills_from_text(text):
    skills_master = [
        "python", "sql", "flask", "aws", "docker", "html", "css",
        "javascript", "react", "machine learning", "deep learning",
        "nlp", "excel", "postgresql", "power bi"
    ]

    lower_text = text.lower()
    found = []

    for skill in skills_master:
        if skill in lower_text:
            found.append(skill.strip().lower())

    return sorted(list(set(found)))

def semantic_matches_from_lists(resume_skills, job_skills):
    semantic_groups = [
        {"sql", "postgresql"},
        {"react", "reactjs"},
        {"machine learning", "ml"},
        {"rest api", "api development"}
    ]

    matches = set()

    for r in resume_skills:
        for j in job_skills:
            if r == j:
                continue

            for group in semantic_groups:
                if r in group and j in group:
                    pair = " ~ ".join(sorted([r, j]))
                    matches.add(pair)

    return sorted(list(matches))

@app.route("/")
def home():
    return jsonify({"message": "Backend is running successfully"})

@app.route("/resume/upload", methods=["POST"])
def upload_resume():
    if "resume" not in request.files:
        return jsonify({"message": "No file uploaded"}), 400

    file = request.files["resume"]

    if file.filename == "":
        return jsonify({"message": "Empty filename"}), 400

    file_name = file.filename
    file_type = file_name.split(".")[-1].lower()
    file_path = os.path.join(UPLOAD_FOLDER, file_name)
    file.save(file_path)

    resume_text = extract_text(file_path, file_type)
    extracted_skills = extract_skills_from_text(resume_text)

    conn = get_connection()
    cur = conn.cursor()

    # use existing user_id = 1 for now
    user_id = 1

    cur.execute("""
        INSERT INTO resumes (user_id, file_name, file_type, resume_text)
        VALUES (%s, %s, %s, %s)
        RETURNING resume_id
    """, (user_id, file_name, file_type, resume_text))

    resume_id = cur.fetchone()[0]

    for skill in extracted_skills:
        cur.execute("""
            INSERT INTO skills (skill_name, source_type, resume_id)
            VALUES (%s, %s, %s)
        """, (skill.lower().strip(), "resume", resume_id))

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "message": "Resume uploaded successfully",
        "resume_id": resume_id,
        "file_name": file_name,
        "skills": extracted_skills
    }), 201

@app.route("/jobs", methods=["POST"])
def create_job():
    data = request.get_json()

    if not data:
        return jsonify({"message": "Invalid JSON body"}), 400

    role_name = data.get("role_name")
    company_name = data.get("company_name")
    job_description = data.get("job_description")

    if not role_name or not job_description:
        return jsonify({"message": "role_name and job_description are required"}), 400

    user_id = 1
    job_skills = extract_skills_from_text(job_description)

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO job_descriptions (user_id, role_name, company_name, job_description_text)
        VALUES (%s, %s, %s, %s)
        RETURNING job_id
    """, (user_id, role_name, company_name, job_description))

    job_id = cur.fetchone()[0]

    for skill in job_skills:
        cur.execute("""
            INSERT INTO skills (skill_name, source_type, job_id)
            VALUES (%s, %s, %s)
        """, (skill.lower().strip(), "job", job_id))

    # get latest resume for quick demo analysis
    cur.execute("""
        SELECT resume_id, file_name, resume_text
        FROM resumes
        ORDER BY uploaded_at DESC
        LIMIT 1
    """)
    latest_resume = cur.fetchone()

    if latest_resume:
        resume_id = latest_resume[0]
        resume_name = latest_resume[1]
        resume_text = latest_resume[2] or ""

        resume_skills = extract_skills_from_text(resume_text)

        matched_skills = list(set(resume_skills) & set(job_skills))
        missing_skills = list(set(job_skills) - set(resume_skills))
        extra_skills = list(set(resume_skills) - set(job_skills))
        semantic_matches = semantic_matches_from_lists(resume_skills, job_skills)

        score = 0
        if len(job_skills) > 0:
            score = int((len(matched_skills) / len(job_skills)) * 100)

        cur.execute("""
            INSERT INTO analysis_results (
                resume_id, job_id, match_score,
                matched_skills_count, missing_skills_count, extra_skills_count
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING analysis_id
        """, (
            resume_id,
            job_id,
            score,
            len(matched_skills),
            len(missing_skills),
            len(extra_skills)
        ))

        analysis_id = cur.fetchone()[0]

        if missing_skills:
            for skill in missing_skills:
                cur.execute("""
                    INSERT INTO recommendations (analysis_id, recommendation_type, recommendation_text)
                    VALUES (%s, %s, %s)
                """, (
                    analysis_id,
                    "suggestion",
                    f"Try learning {skill} and adding it to a project."
                ))
        else:
            cur.execute("""
                INSERT INTO recommendations (analysis_id, recommendation_type, recommendation_text)
                VALUES (%s, %s, %s)
            """, (
                analysis_id,
                "suggestion",
                "Excellent match. Resume aligns well with this job."
            ))

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "message": "Job created successfully",
        "job_id": job_id,
        "job_skills": job_skills
    }), 201

@app.route("/matches", methods=["GET"])
def get_matches():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            ar.analysis_id,
            r.resume_id,
            jd.job_id,
            r.file_name,
            jd.role_name,
            jd.company_name,
            ar.match_score,
            ar.analysis_date
        FROM analysis_results ar
        JOIN resumes r ON ar.resume_id = r.resume_id
        JOIN job_descriptions jd ON ar.job_id = jd.job_id
        ORDER BY ar.analysis_date DESC
    """)

    rows = cur.fetchall()
    results = []

    for row in rows:
        analysis_id = row[0]
        resume_id = row[1]
        job_id = row[2]

        cur.execute("""
            SELECT skill_name FROM skills
            WHERE source_type = 'resume' AND resume_id = %s
        """, (resume_id,))
        resume_skills = [r[0] for r in cur.fetchall()]

        cur.execute("""
            SELECT skill_name FROM skills
            WHERE source_type = 'job' AND job_id = %s
        """, (job_id,))
        job_skills = [j[0] for j in cur.fetchall()]

        matched_skills = list(set(resume_skills) & set(job_skills))
        missing_skills = list(set(job_skills) - set(resume_skills))
        extra_skills = list(set(resume_skills) - set(job_skills))
        semantic_matches = semantic_matches_from_lists(resume_skills, job_skills)

        results.append({
            "match_id": analysis_id,
            "resume_id": resume_id,
            "job_id": job_id,
            "resume_name": row[3],
            "role_name": row[4],
            "company_name": row[5],
            "match_score": row[6],
            "matched_skills": matched_skills,
            "missing_skills": missing_skills,
            "extra_skills": extra_skills,
            "semantic_matches": semantic_matches,
            "created_at": str(row[7])
        })

    cur.close()
    conn.close()

    return jsonify(results), 200

if __name__ == "__main__":
    app.run(debug=True)