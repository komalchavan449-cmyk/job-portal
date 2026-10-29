const express = require("express");
const path = require("path");
const db = require("./db");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = 3000;

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// SERVER STATUS
// ==========================================
app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "Job Portal server is working!"
    });
});

// ==========================================
// HOME PAGE
// ==========================================
app.get("/", (req, res) => {
    res.send(`
        <h1>Job Portal System</h1>
        <p>Server is working successfully!</p>
        <a href="/register.html">Register Here</a>
    `);
});

// ==========================================
// REGISTRATION API
// ==========================================
app.post("/api/register", (req, res) => {
    const { fullName, email, password, role } = req.body;

    if (!fullName || !email || !password || !role) {
        return res.status(400).json({
            success: false,
            message: "All fields are required"
        });
    }

    if (!["candidate", "recruiter"].includes(role)) {
        return res.status(400).json({
            success: false,
            message: "Invalid role"
        });
    }

    bcrypt.hash(password, 10, (hashError, hashedPassword) => {
        if (hashError) {
            console.error("Password error:", hashError);
            return res.status(500).json({
                success: false,
                message: "Password processing failed"
            });
        }

        const sql = `
            INSERT INTO users (name, email, password, role)
            VALUES (?, ?, ?, ?)
        `;

        db.query(
            sql,
            [fullName.trim(), email.trim(), hashedPassword, role],
            (err, result) => {
                if (err) {
                    console.error("Registration error:", err.message);

                    if (err.code === "ER_DUP_ENTRY") {
                        return res.status(409).json({
                            success: false,
                            message: "Email already registered"
                        });
                    }

                    return res.status(500).json({
                        success: false,
                        message: "Registration failed"
                    });
                }

                res.status(201).json({
                    success: true,
                    message: "Registration successful!"
                });
            }
        );
    });
});

// ==========================================
// LOGIN API
// ==========================================
app.post("/api/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Email and password are required"
        });
    }

    const sql = `
        SELECT id, name, email, password, role
        FROM users
        WHERE email = ?
        LIMIT 1
    `;

    db.query(sql, [email.trim()], (err, results) => {
        if (err) {
            console.error("Login database error:", err.message);
            return res.status(500).json({
                success: false,
                message: "Login failed"
            });
        }

        if (results.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const user = results[0];

        bcrypt.compare(password, user.password, (compareError, isMatch) => {
            if (compareError) {
                return res.status(500).json({
                    success: false,
                    message: "Password verification failed"
                });
            }

            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid email or password"
                });
            }

            res.json({
                success: true,
                message: `Login successful! Welcome ${user.name}`,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });
        });
    });
});

// ==========================================
// GET ALL COMPANIES
// ==========================================
app.get("/api/companies", (req, res) => {
    const sql = `
        SELECT
            c.id,
            c.recruiter_id,
            c.company_name,
            c.location,
            u.name AS recruiter_name
        FROM companies c
        LEFT JOIN users u ON c.recruiter_id = u.id
        ORDER BY c.id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Companies error:", err.message);
            return res.status(500).json({
                success: false,
                message: "Unable to fetch companies"
            });
        }

        res.json({
            success: true,
            companies: results
        });
    });
});

// ==========================================
// ADD A COMPANY
// ==========================================
app.post("/api/companies", (req, res) => {
    const { recruiter_id, company_name, location } = req.body;

    if (!recruiter_id || !company_name || !company_name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Recruiter ID and company name are required"
        });
    }

    const sql = `
        INSERT INTO companies
        (recruiter_id, company_name, location)
        VALUES (?, ?, ?)
    `;

    db.query(
        sql,
        [recruiter_id, company_name.trim(), location || null],
        (err, result) => {
            if (err) {
                console.error("Add company error:", err.message);
                return res.status(500).json({
                    success: false,
                    message: "Unable to add company"
                });
            }

            res.status(201).json({
                success: true,
                message: "Company added successfully!",
                companyId: result.insertId
            });
        }
    );
});

// ==========================================
// RECRUITER: GET OWN COMPANIES
// ==========================================
app.get("/api/recruiter/companies/:recruiterId", (req, res) => {
    const recruiterId = Number(req.params.recruiterId);

    if (!Number.isInteger(recruiterId) || recruiterId < 1) {
        return res.status(400).json({
            success: false,
            message: "Invalid recruiter ID"
        });
    }

    const sql = `
        SELECT id, company_name, location
        FROM companies
        WHERE recruiter_id = ?
        ORDER BY id DESC
    `;

    db.query(sql, [recruiterId], (err, results) => {
        if (err) {
            console.error("Recruiter companies error:", err.message);
            return res.status(500).json({
                success: false,
                message: "Unable to fetch companies"
            });
        }

        res.json({
            success: true,
            companies: results
        });
    });
});

// ==========================================
// RECRUITER: POST A JOB
// ==========================================
app.post("/api/recruiter/jobs", (req, res) => {
    const { recruiterId, companyId, title } = req.body;

    if (
        !recruiterId ||
        !companyId ||
        !title ||
        !title.trim()
    ) {
        return res.status(400).json({
            success: false,
            message: "All fields are required"
        });
    }

    const checkSql = `
        SELECT c.id
        FROM companies c
        JOIN users u ON u.id = c.recruiter_id
        WHERE c.id = ?
        AND c.recruiter_id = ?
        AND u.role = 'recruiter'
    `;

    db.query(
        checkSql,
        [companyId, recruiterId],
        (err, results) => {

            if (err) {
                console.error("Company check error:", err.message);
                return res.status(500).json({
                    success: false,
                    message: "Unable to verify company"
                });
            }

            if (results.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "This company does not belong to this recruiter"
                });
            }

            // IMPORTANT: recruiter_id is included here
            const insertSql = `
                INSERT INTO jobs
                (recruiter_id, company_id, title)
                VALUES (?, ?, ?)
            `;

            db.query(
                insertSql,
                [recruiterId, companyId, title.trim()],
                (insertError, result) => {

                    if (insertError) {
                        console.error(
                            "Post job error:",
                            insertError.message
                        );

                        return res.status(500).json({
                            success: false,
                            message: "Unable to post job",
                            error: insertError.message
                        });
                    }

                    res.status(201).json({
                        success: true,
                        message: "Job posted successfully!",
                        jobId: result.insertId
                    });
                }
            );
        }
    );
});

// ==========================================
// RECRUITER: GET OWN JOBS
// ==========================================
app.get("/api/recruiter/jobs/:recruiterId", (req, res) => {
    const recruiterId = Number(req.params.recruiterId);

    if (!Number.isInteger(recruiterId) || recruiterId < 1) {
        return res.status(400).json({
            success: false,
            message: "Invalid recruiter ID"
        });
    }

    const sql = `
        SELECT
            j.id,
            j.title,
            j.company_id,
            c.company_name,
            c.location,
            COUNT(a.id) AS total_applications
        FROM jobs j
        JOIN companies c ON j.company_id = c.id
        LEFT JOIN applications a ON a.job_id = j.id
        WHERE c.recruiter_id = ?
        GROUP BY
            j.id,
            j.title,
            j.company_id,
            c.company_name,
            c.location
        ORDER BY j.id DESC
    `;

    db.query(sql, [recruiterId], (err, results) => {
        if (err) {
            console.error("Recruiter jobs error:", err.message);
            return res.status(500).json({
                success: false,
                message: "Unable to fetch your jobs"
            });
        }

        res.json({
            success: true,
            jobs: results
        });
    });
});

// ==========================================
// RECRUITER: VIEW APPLICATIONS
// ==========================================
app.get(
    "/api/recruiter/jobs/:jobId/applications/:recruiterId",
    (req, res) => {

        const jobId = Number(req.params.jobId);
        const recruiterId = Number(req.params.recruiterId);

        if (
            !Number.isInteger(jobId) || jobId < 1 ||
            !Number.isInteger(recruiterId) || recruiterId < 1
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID"
            });
        }

        const sql = `
            SELECT
                a.id AS application_id,
                a.job_id,
                a.candidate_id,
                u.name AS candidate_name,
                u.email AS candidate_email,
                a.status,
                a.applied_at
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            JOIN companies c ON j.company_id = c.id
            JOIN users u ON a.candidate_id = u.id
            WHERE j.id = ?
            AND c.recruiter_id = ?
            ORDER BY a.applied_at DESC
        `;

        db.query(sql, [jobId, recruiterId], (err, results) => {
            if (err) {
                console.error("Recruiter applications error:", err.message);
                return res.status(500).json({
                    success: false,
                    message: "Unable to fetch applications"
                });
            }

            res.json({
                success: true,
                applications: results
            });
        });
    }
);

// ==========================================
// RECRUITER: UPDATE APPLICATION STATUS
// ==========================================
app.patch(
    "/api/recruiter/applications/:applicationId/status",
    (req, res) => {

        const applicationId = Number(req.params.applicationId);
        const recruiterId = Number(req.body.recruiterId);
        const { status } = req.body;

        const allowedStatuses = [
            "Under Review",
            "Shortlisted",
            "Approved",
            "Rejected"
        ];

        if (
            !Number.isInteger(applicationId) || applicationId < 1 ||
            !Number.isInteger(recruiterId) || recruiterId < 1 ||
            !allowedStatuses.includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid application ID, recruiter ID or status"
            });
        }

        const sql = `
            UPDATE applications a
            JOIN jobs j ON a.job_id = j.id
            JOIN companies c ON j.company_id = c.id
            SET a.status = ?
            WHERE a.id = ?
            AND c.recruiter_id = ?
        `;

        db.query(
            sql,
            [status, applicationId, recruiterId],
            (err, result) => {

                if (err) {
                    console.error("Status update error:", err.message);
                    return res.status(500).json({
                        success: false,
                        message: "Unable to update application status"
                    });
                }

                if (result.affectedRows === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Application not found or not your job"
                    });
                }

                res.json({
                    success: true,
                    message: "Application status updated successfully"
                });
            }
        );
    }
);

// ==========================================
// GET ALL JOBS
// ==========================================
app.get("/api/jobs", (req, res) => {
    const sql = `
        SELECT
            jobs.id,
            jobs.title,
            companies.company_name,
            companies.location
        FROM jobs
        LEFT JOIN companies
        ON jobs.company_id = companies.id
        ORDER BY jobs.id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Jobs fetch error:", err.message);
            return res.status(500).json({
                success: false,
                message: "Unable to fetch jobs"
            });
        }

        res.json({
            success: true,
            jobs: results
        });
    });
});

// ==========================================
// APPLY FOR A JOB
// ==========================================
app.post("/api/apply", (req, res) => {
    const { jobId, candidateId } = req.body;

    if (!jobId || !candidateId) {
        return res.status(400).json({
            success: false,
            message: "Job ID and Candidate ID are required"
        });
    }

    const sql = `
        INSERT INTO applications (job_id, candidate_id)
        SELECT jobs.id, users.id
        FROM jobs
        JOIN users ON users.id = ?
        WHERE jobs.id = ?
        AND users.role = 'candidate'
    `;

    db.query(sql, [candidateId, jobId], (err, result) => {
        if (err) {
            if (err.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    success: false,
                    message: "You have already applied for this job"
                });
            }

            console.error("Application error:", err.message);
            return res.status(500).json({
                success: false,
                message: "Unable to submit application"
            });
        }

        if (result.affectedRows === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid job or candidate"
            });
        }

        res.status(201).json({
            success: true,
            message: "Application submitted successfully!"
        });
    });
});

// ==========================================
// ADMIN: GET ALL APPLICATIONS
// ==========================================
app.get("/api/admin/applications", (req, res) => {
    const sql = `
        SELECT id, job_id, candidate_id, status, applied_at
        FROM applications
        ORDER BY applied_at DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Admin applications error:", err.message);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch applications"
            });
        }

        res.json({
            success: true,
            applications: results
        });
    });
});

// ==========================================
// ADMIN: UPDATE APPLICATION STATUS
// ==========================================
app.patch("/api/admin/applications/:id/status", (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body;

    const allowedStatuses = [
        "Approved",
        "Rejected",
        "Shortlisted"
    ];

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
            success: false,
            message: "Invalid application ID"
        });
    }

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
            success: false,
            message: "Invalid status"
        });
    }

    const sql = `
        UPDATE applications
        SET status = ?
        WHERE id = ?
    `;

    db.query(sql, [status, id], (err, result) => {
        if (err) {
            console.error("Status update error:", err.message);
            return res.status(500).json({
                success: false,
                message: "Failed to update application"
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Application not found"
            });
        }

        res.json({
            success: true,
            message: `Application ${status} successfully`
        });
    });
});

// ==========================================
// CANDIDATE: GET OWN APPLICATIONS
// ==========================================
app.get("/api/candidate/applications/:candidateId", (req, res) => {
    const candidateId = Number(req.params.candidateId);

    if (!Number.isInteger(candidateId) || candidateId < 1) {
        return res.status(400).json({
            success: false,
            message: "Invalid candidate ID"
        });
    }

    const sql = `
        SELECT
            a.id AS application_id,
            a.job_id,
            j.title AS job_title,
            c.company_name,
            a.status,
            a.applied_at
        FROM applications a
        LEFT JOIN jobs j ON a.job_id = j.id
        LEFT JOIN companies c ON j.company_id = c.id
        WHERE a.candidate_id = ?
        ORDER BY a.applied_at DESC
    `;

    db.query(sql, [candidateId], (err, results) => {
        if (err) {
            console.error("Candidate applications error:", err.message);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch application statuses"
            });
        }

        return res.json({
            success: true,
            applications: results
        });
    });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`Job Portal running at http://localhost:${PORT}`);
});