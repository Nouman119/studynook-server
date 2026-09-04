
```markdown
# ⚙️ StudyNook API – Backend Service

StudyNook Backend is a secure RESTful API service built with Express.js and MongoDB to support authentication, room catalog management, and automated booking reservation workflows.

🔗 **Live API Base URL:** https://studynook-server-ua88.onrender.com

---

## ✨ Key Backend Features

* **Hybrid Token Verification:** Middleware supporting both cross-domain `Cookie` credentials and `Bearer Token` Authorization headers for reliable cross-origin requests.
* **Strict Collision-Free Booking Logic:** MongoDB queries check overlapping start and end timestamps (`$lte` and `$gte`) to eliminate double bookings for any room.
* **Relational Document Aggregation:** MongoDB `$lookup` aggregations that stitch booking logs directly with complete host and workspace metadata.
* **Role-Based Ownership Control:** Verification ensuring users can only edit or delete workspaces they personally published.
* **Auto-Increment Metrics:** Automated counter adjustments (`bookingCount`) upon successful reservations or user-initiated cancellations.

---

## 🛠️ Tech Stack

* **Runtime:** Node.js
* **Framework:** Express.js
* **Database:** MongoDB Native Driver
* **Authentication:** JSON Web Token (`jsonwebtoken`) & `cookie-parser`
* **CORS Management:** Express CORS with origin whitelisting & credentials
* **Deployment:** Render

---