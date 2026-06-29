
## Getting Started Locally

Follow these steps to set up, run, and test the project on your local machine.

### Prerequisites

Before getting started, make sure you have the following installed on your system:
* **Node.js** (v18.0 or higher recommended)
* **npm** (comes bundled with Node.js)
* **Git** (if cloning from GitHub)

---

### Step 1: Get the Project Files

If you are cloning from GitHub, open your terminal or command prompt and run:

```bash
git clone [https://github.com/iamdiyaajay-png/Readyup2.0-.git](https://github.com/iamdiyaajay-png/Readyup2.0-.git)
cd "Ready up 2.0!"

```

*(If you already have the folder locally on your computer, simply open your terminal and navigate inside the project folder).*

---

### Step 2: Install Dependencies

Install all required Node modules (including React, Vite, Tailwind CSS, Firebase, and Gemini AI SDKs) by running:

```bash
npm install

```

---

### Step 3: Set Up Environment Variables

The project requires a `.env` file in the root directory to connect to Firebase, Google Gemini AI, and handle authentication encryption.

1. Create a new file named `.env` in the root folder of the project (`/Ready up 2.0!/.env`).
2. Add the following required environment variables to the file:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
VITE_FIREBASE_RTDB_URL=https://your_project_id-default-rtdb.firebaseio.com

# Security & Admin Config
VITE_ENCRYPT_KEY=your_secure_encryption_key_here
VITE_ADMIN_EMAIL=admin_email@example.com

# Google Gemini API Key
VITE_GEMINI_API_KEY=your_gemini_api_key

```

> 💡 **Note:** If you are testing against the existing production Firebase/Gemini instance, copy the values from your team's existing `.env` configuration. Otherwise, replace the values above with your own Firebase project credentials and Gemini API key.

---

### Step 4: Run the Development Server

Once dependencies are installed and `.env` is configured, start the local Vite development server:

```bash
npm run dev

```

In your terminal, you will see output indicating that the server is running, typically at:

```text
➜  Local:   http://localhost:5173/

```

Open [http://localhost:5173/](https://www.google.com/search?q=http://localhost:5173/) in your web browser to view and interact with the application. The app supports Hot Module Replacement (HMR), meaning any edits you make to code files in `src/` will instantly update in the browser.

---

### Step 5: How to Test the Project Locally

#### 1. Manual Functional Testing

* **Authentication:** Test logging in as a student/user or try navigating to the admin login page (`/admin` or via the Admin login component).
* **AI Features:** Test features relying on the Gemini AI API (e.g., resume/placement assistance) to verify that `VITE_GEMINI_API_KEY` is functioning properly.
* **Database:** Verify that Firebase Firestore and Realtime Database read/write operations succeed without permission errors.

#### 2. Code Quality & Linting

To check for syntax errors, React hook rule violations, or formatting issues across the codebase, run:

```bash
npm run lint

```

#### 3. Production Build & Preview Testing

To ensure the project builds successfully for production deployment without errors, test building the bundle and running a local preview server:

```bash
# 1. Create the production build
npm run build

# 2. Preview the built application locally
npm run preview

```

This will start a local static preview server (usually on `http://localhost:4173/`) allowing you to test exactly how the built application behaves before deploying it live.

```

```
