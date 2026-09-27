
import { FormEvent, useEffect, useState } from "react";
import { api } from "./api";
import VideoStudy from "./VideoStudy";

type User = {
  id: number;
  email: string;
};

type Video = {
  id: number;
  video_url: string;
  title: string | null;
  sentences: Sentence[];
};

type Sentence = {
  id: number;
  text: string;
  start_time: number;
  end_time: number;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  const [mode, setMode] = useState<"login" | "register">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");

  const [videos, setVideos] = useState<Video[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Vídeo atualmente selecionado para estudar
  const [selectedVideoId, setSelectedVideoId] =
    useState<number | null>(null);

  // --------------------------------------------------
  // Verifica usuário autenticado
  // --------------------------------------------------

  useEffect(() => {
    api.me()
      .then((user) => {
        setUser(user as User);
      })
      .catch(() => {
        setUser(null);
      });
  }, []);

  // --------------------------------------------------
  // Quando usuário estiver autenticado,
  // carrega os vídeos
  // --------------------------------------------------

  useEffect(() => {
    if (!user) {
      return;
    }

    loadVideos();
  }, [user]);

  // --------------------------------------------------
  // Carregar vídeos
  // --------------------------------------------------

  async function loadVideos() {
    try {
      setLoadingVideos(true);
      setError("");

      const result = await api.videos();

      setVideos(result as Video[]);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os vídeos."
      );
    } finally {
      setLoadingVideos(false);
    }
  }

  // --------------------------------------------------
  // Login / Cadastro
  // --------------------------------------------------

  async function submitAuth(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const result =
        mode === "login"
          ? await api.login(email, password)
          : await api.register(email, password);

      setUser(result as User);

      setEmail("");
      setPassword("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível realizar a operação."
      );
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // Adicionar vídeo
  // --------------------------------------------------

  async function addVideo(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!videoUrl.trim()) {
      setError("Cole o link do vídeo.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      await api.createVideo(
        videoUrl.trim(),
        videoTitle.trim() || undefined
      );

      setVideoUrl("");
      setVideoTitle("");

      setMessage("Vídeo adicionado com sucesso.");

      await loadVideos();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível adicionar o vídeo."
      );
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // Logout
  // --------------------------------------------------

  async function logout() {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setVideos([]);
      setSelectedVideoId(null);
    }
  }

  // ==================================================
  // USUÁRIO NÃO AUTENTICADO
  // ==================================================

  if (!user) {
    return (
      <main className="auth">
        <section className="card auth-card">
          <h1>English Shadowing</h1>

          <p className="subtitle">
            Pratique inglês usando frases dos seus vídeos.
          </p>

          <form onSubmit={submitAuth}>
            <label>Email</label>

            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              required
            />

            <label>Senha</label>

            <input
              type="password"
              placeholder="Sua senha"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              minLength={8}
              required
            />

            <button
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Aguarde..."
                : mode === "login"
                ? "Entrar"
                : "Criar conta"}
            </button>
          </form>

          {error && (
            <p className="error">
              {error}
            </p>
          )}

          <button
            type="button"
            className="link-button"
            onClick={() => {
              setMode(
                mode === "login"
                  ? "register"
                  : "login"
              );

              setError("");
            }}
          >
            {mode === "login"
              ? "Ainda não tenho uma conta"
              : "Já tenho uma conta"}
          </button>
        </section>
      </main>
    );
  }

  // ==================================================
  // USUÁRIO AUTENTICADO + VÍDEO SELECIONADO
  // ==================================================

  if (selectedVideoId !== null) {
    return (
      <VideoStudy
        videoId={selectedVideoId}
        onBack={() =>
          setSelectedVideoId(null)
        }
      />
    );
  }

  // ==================================================
  // DASHBOARD PRINCIPAL
  // ==================================================

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>English Shadowing</h1>

          <p>{user.email}</p>
        </div>

        <button
          type="button"
          onClick={logout}
        >
          Sair
        </button>
      </header>

      {/* ==============================================
          ADICIONAR VÍDEO
      ============================================== */}

      <section className="card">
        <div className="section-header">
          <div>
            <h2>Adicionar vídeo</h2>

            <p>
              Cole o link do vídeo. O vídeo original
              não será armazenado no nosso banco.
            </p>
          </div>
        </div>

        <form
          onSubmit={addVideo}
          className="video-form"
        >
          <label>
            Link do vídeo
          </label>

          <input
            type="url"
            placeholder="https://odysee.com/@canal:claim/video:claim"
            value={videoUrl}
            onChange={(event) =>
              setVideoUrl(event.target.value)
            }
            required
          />

          <label>
            Título (opcional)
          </label>

          <input
            type="text"
            placeholder="Ex.: English conversation at work"
            value={videoTitle}
            onChange={(event) =>
              setVideoTitle(event.target.value)
            }
          />

          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Adicionando..."
              : "Adicionar vídeo"}
          </button>
        </form>

        {message && (
          <p className="success">
            {message}
          </p>
        )}

        {error && (
          <p className="error">
            {error}
          </p>
        )}
      </section>

      {/* ==============================================
          LISTA DE VÍDEOS
      ============================================== */}

      <section className="card">
        <div className="section-header">
          <div>
            <h2>Meus vídeos</h2>

            <p>
              Seus vídeos salvos para estudar
              posteriormente.
            </p>
          </div>

          <button
            type="button"
            onClick={loadVideos}
            disabled={loadingVideos}
          >
            {loadingVideos
              ? "Atualizando..."
              : "Atualizar"}
          </button>
        </div>

        {loadingVideos ? (
          <p>
            Carregando vídeos...
          </p>
        ) : videos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              🎬
            </div>

            <h3>
              Nenhum vídeo ainda
            </h3>

            <p>
              Adicione seu primeiro vídeo
              acima para começar.
            </p>
          </div>
        ) : (
          <div className="video-list">
            {videos.map((video) => (
              <article
                className="video-item"
                key={video.id}
              >
                <div className="video-info">
                  <div className="video-icon">
                    🎬
                  </div>

                  <div>
                    <h3>
                      {video.title ||
                        "Vídeo sem título"}
                    </h3>

                    <a
                      href={video.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {video.video_url}
                    </a>

                    <p>
                      {video.sentences?.length ?? 0}{" "}
                      frases
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedVideoId(video.id)
                  }
                >
                  Estudar
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

