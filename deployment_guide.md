# 🚀 MindMesh Cloud Deployment Guide

This guide explains how to deploy the **MindMesh** project to the cloud for submission. Since the project contains a stateful backend (WebSockets, SQLite database, and Express server) and a Next.js frontend, we split the deployment into two free cloud services:
1. **Frontend (Next.js)** ➔ Deployed on **Vercel** (Free static/serverless hosting)
2. **Backend (Express & WebSockets)** ➔ Deployed on **Render.com** (Free persistent Node.js service)

---

## 🛠️ Step 1: Deploy the Backend on Render.com

Render is a free cloud platform that supports persistent stateful Node.js servers, WebSockets, and database storage.

1. Go to [Render.com](https://render.com/) and sign up with your GitHub account.
2. Click **New +** and select **Web Service**.
3. Link your GitHub repository (`MindMesh`).
4. Configure the Web Service settings:
   - **Name:** `mindmesh-backend` (or any name you prefer)
   - **Root Directory:** `backend` (⚠️ Important: Set this to deploy only the backend folder)
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npx prisma generate`
   - **Start Command:** `node src/server.js`
   - **Instance Type:** `Free`
5. Click **Deploy Web Service**.
6. Once deployed, copy your backend URL (e.g., `https://mindmesh-backend.onrender.com`).

---

## ⚡ Step 2: Deploy the Frontend on Vercel

Vercel is the official platform for hosting Next.js applications.

1. Go to [Vercel.com](https://vercel.com/) and sign up with your GitHub account.
2. Click **Add New** ➔ **Project**.
3. Import your GitHub repository (`MindMesh`).
4. Configure the Project settings:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** `frontend` (⚠️ Important: Set this to deploy only the frontend folder)
5. Expand **Environment Variables** and add the following:
   - **Key:** `NEXT_PUBLIC_API_URL`
   - **Value:** `https://your-backend.onrender.com` (Paste the Render backend URL you copied in Step 1)
6. Click **Deploy**.
7. Vercel will build and launch your site. You will receive a live submission link (e.g., `https://mindmesh-frontend.vercel.app`)!

---

## 🧪 Step 3: Seed the Live Database (One-time Setup)

Once the backend is live on Render, you should seed the database once so that the Boston dataset and default pipelines are populated:

1. Open a terminal on your local computer.
2. In Render, go to your Web Service dashboard ➔ **Shell** tab.
3. Run the following command inside the Render shell to seed the live database:
   ```bash
   node prisma/seed.js
   ```
4. Now, open your Vercel URL, and everything will be preloaded and fully functional!

---

> [!NOTE]
> During your presentation, you can open the Vercel link directly. If Render's free tier service goes to sleep due to inactivity, it might take 30-50 seconds to boot up on the first load. Simply reload the Vercel page once the backend wakes up!
