# petconnect-prototype
This is a prototype of PetConnect e-Commerce webapp for the capstone project of 4 students located in FEU Roosevelt, Marikina, Philippines

## Run with Docker

1. Copy env templates:
   - `copy backend\\.env.example backend\\.env`
   - `copy frontend\\.env.example frontend\\.env`
2. Fill in real Supabase keys in both env files.
3. Build and start:
   - `docker compose up --build`
4. Open:
   - Frontend: `http://localhost:5173`
   - Backend API: `http://localhost:4141`
