# 🚀 Telegram Free Hosting Bot

A professional Telegram-based free website hosting bot that allows users to upload static website projects directly from Telegram and deploy them automatically to Cloudflare Pages.

Users can upload a ZIP file containing HTML, CSS, JavaScript, images, fonts, and other supported static assets. The bot validates the project, creates a unique project, deploys it to Cloudflare Pages, and returns a live website URL.

---

## ✨ Features

### 👤 User System

- Telegram user registration
- Automatic user profile creation
- Username and Telegram ID tracking
- Account status management
- Block / unblock system
- User access protection
- User statistics

### 🌐 Website Hosting

- Upload website ZIP files directly through Telegram
- Automatic ZIP validation
- ZIP path traversal protection
- Static website validation
- `index.html` requirement
- File extension validation
- File count validation
- Project size validation
- Automatic project creation
- Automatic Cloudflare Pages deployment
- Unique project names
- Live `.pages.dev` URL
- Deployment status tracking

### 📁 Project Management

Users can:

- View all projects
- View project details
- Open live website
- Check deployment status
- Delete projects
- Refresh project list

Project statuses:

- `pending`
- `deploying`
- `active`
- `failed`
- `suspended`
- `deleted`

### 🛡️ Admin System

Admin dashboard includes:

- Dashboard statistics
- User management
- Project management
- Cloudflare connection test
- User blocking
- User unblocking
- User project inspection
- Project deletion
- Project status monitoring
- Broadcast system

### 📢 Broadcast System

Admins can send announcements to users.

Supported Telegram message types include:

- Text
- Photo
- Video
- Document
- Audio
- Animation
- Voice
- Video Note
- Sticker
- Contact
- Location
- Poll

Blocked users are automatically excluded from broadcasts.

### 🔒 Security

- Environment variable based secrets
- No API keys inside source code
- ZIP path traversal protection
- File extension validation
- Project ownership checks
- Admin authorization
- Blocked-user protection
- File size limits
- File count limits
- Safe project IDs
- Safe file paths
- Temporary file cleanup

---

# 🏗️ Architecture

The bot uses a Node.js backend and Cloudflare Pages for website hosting.

```text
Telegram User
      │
      ▼
Telegram Bot
      │
      ▼
Node.js Backend
      │
      ├── User System
      ├── Project Manager
      ├── ZIP Validator
      ├── Storage Manager
      ├── Admin System
      └── Database
      │
      ▼
Cloudflare Pages
      │
      ▼
Live Website
https://project.pages.dev
