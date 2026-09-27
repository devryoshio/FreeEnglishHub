# English Shadowing App

MVP com React + TypeScript + FastAPI + PostgreSQL + Docker.

O PostgreSQL guarda apenas dados da aplicação: usuário, URL do vídeo, frases/timestamps, vocabulário e resultados de prática. Não há persistência de vídeo ou áudio.

## Rodar

```bash
cp .env.example .env
docker compose up --build
```

Frontend: http://localhost:5173  
API: http://localhost:8000  
Swagger: http://localhost:8000/docs

A próxima etapa é integrar o player oficial (ex.: YouTube IFrame API), Whisper, IPA e dicionário.
