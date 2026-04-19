# Collaborative Document Editor with AI Writing Assistant

## Live Access & How to Run the Application

Frontend: [http://localhost:5174/login](http://localhost:5174/login)  
Backend API Documentation: [http://127.0.0.1:8001/docs](http://127.0.0.1:8001/docs)  

---

### How to Access the Application

The links above are local development links, which means they will only work if the application is running on your machine.

To run the full system, open two terminals and start both the backend and frontend together:

```bash
# Terminal 1 — Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

To enable the live AI assistant, create `backend/.env` from `backend/.env.example` and add your `OPENAI_API_KEY` before starting the backend.
---

## Overview

This project implements a full-stack collaborative document editor with an integrated AI writing assistant. The system allows users to create, edit, and manage documents while also providing AI-powered writing support through a streaming interface.

The application is designed using a client–server architecture, where a React frontend communicates with a FastAPI backend. Authentication is handled using JSON Web Tokens (JWT), and access control is enforced through role-based permissions. The AI assistant is implemented using a streaming response model, allowing text suggestions to appear progressively in the user interface.

---

## System Features

The system supports user authentication through registration and login, with all passwords securely hashed before storage. Upon successful login, users receive a JWT token that is used to access protected API endpoints. Sessions are maintained on the frontend using local storage.

The document management functionality allows users to create new documents, view a list of accessible documents, edit document content, and save updates. The editor includes an auto-save behavior simulation and maintains a version history for each document. Users can restore previous versions of a document at any time.

Access control is implemented using three roles: owner, editor, and viewer. Owners can share documents and assign roles to other users via email. Editors are allowed to modify document content and use AI features, while viewers have read-only access. All permissions are enforced on the backend to ensure security.

The AI writing assistant provides a rewrite feature that generates improved versions of text. The response is streamed from the backend to the frontend, creating a real-time typing effect. Instead of directly modifying the document, the system displays AI suggestions in a separate panel, allowing users to accept or reject them.

---

## Architecture Overview

The application follows a modular architecture with clear separation between frontend and backend components. The React frontend handles user interaction, routing, and state management, while the FastAPI backend manages authentication, document logic, and AI processing.

All communication between frontend and backend occurs via REST APIs. JWT tokens are included in request headers to ensure secure access to protected endpoints. Document data is stored in-memory for simplicity, and version history is maintained through structured snapshots of document states.

The AI functionality is implemented using a streaming endpoint that sends text chunks progressively to the frontend. This design simulates real-time AI generation and aligns with modern AI interaction patterns.

---

## Setup and Execution

To run the application, the backend server must be started first, followed by the frontend development server. Once both are running, the system can be accessed through the browser using the frontend URL.

The backend provides interactive API documentation through Swagger, allowing all endpoints to be tested directly.

The system requires environment variables for configuration, including a secret key used for JWT token generation and token expiration settings. These are defined in a `.env` file, with a corresponding `.env.example` provided for reference.

---

## Usage Flow

A typical user interaction begins with account registration followed by login. After authentication, the user is redirected to the dashboard where documents can be created and managed. Selecting a document opens the editor, where content can be modified and saved.

Users can invoke the AI assistant to generate improved text suggestions. These suggestions are displayed separately, allowing users to review and decide whether to apply them. Documents can be shared with other users by entering their email and assigning a role.

The version history section provides a list of previous document states, enabling users to restore earlier versions if needed.

---

## Demo Script (Presentation)

This is the recommended 5-minute demo flow:

“First, I will demonstrate the authentication system by registering a new user and logging in. Once logged in, the user is redirected to the dashboard, where all accessible documents are displayed.

Next, I create a new document and open it in the editor. Here, I can edit the content and observe the auto-save behavior, which updates the document status dynamically.

I then demonstrate the AI writing assistant by selecting some text and clicking the AI rewrite button. The system streams the AI-generated suggestion in real time. Instead of directly modifying the document, the suggestion appears in a separate panel, where I can choose to accept or reject it.

After that, I show the sharing functionality by sharing the document with another user and assigning a role. Logging in as that second user shows that the document appears in their dashboard with the correct permissions.

Finally, I demonstrate version history by restoring a previous version of the document, showing that the system maintains document state over time.”

---

## Deviations from Initial Design

Several implementation decisions differ from the original architectural design. Instead of using a database, the system uses in-memory storage to simplify development and reduce setup complexity. Real-time collaboration features such as CRDTs or operational transforms were not fully implemented; instead, the system focuses on core document functionality.

Additionally, the AI assistant can be connected to a live OpenAI model through `OPENAI_API_KEY`. If the key is missing, the backend rejects AI requests until it is configured. These decisions keep the project flexible for demos while still allowing real AI output.

---

## Known Limitations

The system does not persist data after backend restart due to the use of in-memory storage. Real-time multi-user editing is not fully supported. Despite these limitations, the system demonstrates all required architectural and functional concepts.

---

## Author

AI1220 — Software, Web & Mobile Engineering  
Spring 2026

Ghalia AlKhoori 
