import { useEffect, useMemo, useRef, useState } from "react";
import YouTube, { YouTubeEvent } from "react-youtube";
import { api } from "./api";

type Sentence = {
  id: number;
  text: string;
  start_time: number;
  end_time: number;
};

type Video = {
  id: number;
  video_url: string;
  title: string | null;
  sentences: Sentence[];
};

type WordDefinition = {
  word: string;
  ipa: string | null;
  meaning: string | null;
  example: string | null;
  part_of_speech: string | null;
};

type ShadowingResult = {
  attempt_id: number;
  sentence_id: number;
  expected_text: string;
  recognized_text: string;
  similarity_score: number;
  score: number;
};

type Props = {
  videoId: number;
  onBack: () => void;
};

function extractYoutubeId(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      if (id) return id;
    }

    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.replace("/", "");
    }

    return null;
  } catch {
    return null;
  }
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  return `${minutes}:${remaining.toFixed(2).padStart(5, "0")}`;
}

export default function VideoStudy({ videoId, onBack }: Props) {
  const [video, setVideo] = useState<Video | null>(null);
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedSentenceId, setSelectedSentenceId] =
    useState<number | null>(null);
  const [playingSentenceId, setPlayingSentenceId] =
    useState<number | null>(null);

  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionMessage, setTranscriptionMessage] = useState("");

  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordDefinition, setWordDefinition] =
    useState<WordDefinition | null>(null);
  const [loadingWord, setLoadingWord] = useState(false);
  const [wordError, setWordError] = useState("");

  // --------------------------------------------------
  // Shadowing
  // --------------------------------------------------

  const [recording, setRecording] = useState(false);
  const [processingShadowing, setProcessingShadowing] = useState(false);
  const [shadowingResult, setShadowingResult] =
    useState<ShadowingResult | null>(null);
  const [selectedShadowingSentence, setSelectedShadowingSentence] =
    useState<Sentence | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const shadowingAnimationFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const shadowingSentenceRef = useRef<Sentence | null>(null);
  const shadowingStoppingRef = useRef(false);

  const youtubeId = useMemo(() => {
    if (!video) return null;
    return extractYoutubeId(video.video_url);
  }, [video]);

  // --------------------------------------------------
  // Carregar vídeo
  // --------------------------------------------------

  useEffect(() => {
    loadVideo();

    return () => {
      stopCurrentSentence();
      stopShadowingRecording();
    };
  }, [videoId]);

  async function loadVideo() {
    try {
      setLoading(true);
      setError("");

      const result = await api.getVideo(videoId);
      setVideo(result as Video);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o vídeo."
      );
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // Dicionário
  // --------------------------------------------------

  async function lookupWord(word: string) {
    try {
      setSelectedWord(word);
      setWordDefinition(null);
      setWordError("");
      setLoadingWord(true);

      const result = await api.lookupWord(word);
      setWordDefinition(result as WordDefinition);
    } catch (error) {
      setWordError(
        error instanceof Error
          ? error.message
          : "Não foi possível consultar a palavra."
      );
    } finally {
      setLoadingWord(false);
    }
  }

  function renderSentenceWords(text: string) {
    const words = text.split(/(\s+)/);

    return words.map((part, index) => {
      if (/^\s+$/.test(part)) {
        return part;
      }

      return (
        <button
          key={index}
          type="button"
          className="word-button"
          onClick={(event) => {
            event.stopPropagation();
            lookupWord(part);
          }}
        >
          {part}
        </button>
      );
    });
  }

  // --------------------------------------------------
  // Whisper - gerar frases do vídeo
  // --------------------------------------------------

  async function transcribe() {
    try {
      setTranscribing(true);
      setTranscriptionMessage("");
      setError("");

      await api.transcribeVideo(videoId);
      await loadVideo();

      setTranscriptionMessage("Frases geradas com sucesso!");
    } catch (error) {
      setTranscriptionMessage(
        error instanceof Error
          ? error.message
          : "Erro ao gerar transcrição."
      );
    } finally {
      setTranscribing(false);
    }
  }

  // --------------------------------------------------
  // YouTube
  // --------------------------------------------------

  function onPlayerReady(event: YouTubeEvent) {
    setPlayer(event.target);
  }

  // --------------------------------------------------
  // Reprodução de frase
  // --------------------------------------------------

  function stopCurrentSentence() {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (player) {
      player.pauseVideo();
    }

    setPlayingSentenceId(null);
  }

  function playSentence(sentence: Sentence) {
    if (!player) return;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setSelectedSentenceId(sentence.id);
    setPlayingSentenceId(sentence.id);

    player.seekTo(sentence.start_time, true);
    player.playVideo();

    const checkTime = () => {
      const currentTime = player.getCurrentTime();

      if (currentTime >= sentence.end_time) {
        player.pauseVideo();
        animationFrameRef.current = null;
        setPlayingSentenceId(null);
        return;
      }

      animationFrameRef.current = requestAnimationFrame(checkTime);
    };

    animationFrameRef.current = requestAnimationFrame(checkTime);
  }

  function selectSentence(sentence: Sentence) {
    setSelectedSentenceId(sentence.id);
  }

  // --------------------------------------------------
  // Shadowing
  // --------------------------------------------------

  async function startShadowing(sentence: Sentence) {
    if (!player || recording || processingShadowing) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Seu navegador não permite acesso ao microfone.");
      return;
    }

    try {
      setSelectedSentenceId(sentence.id);
      setSelectedShadowingSentence(sentence);
      setShadowingResult(null);
      setError("");
      setRecording(false);
      shadowingSentenceRef.current = sentence;
      shadowingStoppingRef.current = false;

      stopCurrentSentence();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        stopShadowingRecording();
        setError("Ocorreu um erro durante a gravação.");
      };

      recorder.onstop = async () => {
        const chunks = audioChunksRef.current;
        const mimeType = recorder.mimeType || "audio/webm";

        mediaRecorderRef.current = null;

        if (chunks.length === 0) {
          cleanupShadowingStream();
          setRecording(false);
          setProcessingShadowing(false);
          setError("Nenhum áudio foi capturado.");
          return;
        }

        const audioBlob = new Blob(chunks, {
          type: mimeType,
        });

        audioChunksRef.current = [];
        cleanupShadowingStream();
        setRecording(false);

        await sendShadowing(sentence, audioBlob);
      };

      recorder.start();
      setRecording(true);

      player.seekTo(sentence.start_time, true);
      player.playVideo();

      monitorShadowingSentence(sentence);
    } catch (error) {
      cleanupShadowingStream();
      mediaRecorderRef.current = null;
      setRecording(false);

      console.error("Erro ao iniciar Shadowing:", error);

      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setError(
          "Permissão para usar o microfone foi negada. Permita o acesso ao microfone no navegador."
        );
      } else {
        setError("Não foi possível iniciar o Shadowing.");
      }
    }
  }

  function monitorShadowingSentence(sentence: Sentence) {
    if (shadowingAnimationFrameRef.current !== null) {
      cancelAnimationFrame(shadowingAnimationFrameRef.current);
    }

    const checkTime = () => {
      if (!player || shadowingStoppingRef.current) {
        shadowingAnimationFrameRef.current = null;
        return;
      }

      const currentTime = player.getCurrentTime();

      if (currentTime >= sentence.end_time) {
        player.pauseVideo();
        shadowingAnimationFrameRef.current = null;
        stopShadowingRecording();
        return;
      }

      shadowingAnimationFrameRef.current =
        requestAnimationFrame(checkTime);
    };

    shadowingAnimationFrameRef.current =
      requestAnimationFrame(checkTime);
  }

  function cleanupShadowingStream() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });

      mediaStreamRef.current = null;
    }
  }

  function stopShadowingRecording() {
    shadowingStoppingRef.current = true;

    if (shadowingAnimationFrameRef.current !== null) {
      cancelAnimationFrame(shadowingAnimationFrameRef.current);
      shadowingAnimationFrameRef.current = null;
    }

    if (player) {
      player.pauseVideo();
    }

    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      cleanupShadowingStream();
      setRecording(false);
      return;
    }

    if (recorder.state !== "inactive") {
      recorder.stop();
    } else {
      cleanupShadowingStream();
      setRecording(false);
    }
  }

  async function sendShadowing(
    sentence: Sentence,
    audioBlob: Blob
  ) {
    try {
      setProcessingShadowing(true);
      setError("");

      const result = await api.shadowing(
        sentence.id,
        audioBlob
      );

      setShadowingResult(result as ShadowingResult);
    } catch (error) {
      console.error("Erro no Shadowing:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Erro ao processar o Shadowing."
      );
    } finally {
      setProcessingShadowing(false);
      shadowingStoppingRef.current = false;
    }
  }

  // --------------------------------------------------
  // Loading
  // --------------------------------------------------

  if (loading) {
    return (
      <main className="app">
        <p>Carregando vídeo...</p>
      </main>
    );
  }

  // --------------------------------------------------
  // Erro
  // --------------------------------------------------

  if (error || !video) {
    return (
      <main className="app">
        <button
          type="button"
          onClick={onBack}
        >
          ← Voltar
        </button>

        <p className="error">
          {error || "Vídeo não encontrado."}
        </p>
      </main>
    );
  }

  // --------------------------------------------------
  // URL inválida
  // --------------------------------------------------

  if (!youtubeId) {
    return (
      <main className="app">
        <button
          type="button"
          onClick={onBack}
        >
          ← Voltar
        </button>

        <section className="card">
          <h2>URL não reconhecida</h2>

          <p>
            No momento estamos trabalhando com links do YouTube.
          </p>
        </section>
      </main>
    );
  }

  // --------------------------------------------------
  // Interface
  // --------------------------------------------------

  return (
    <main className="app">
      {/* ==============================================
          VOLTAR
      ============================================== */}

      <button
        type="button"
        onClick={() => {
          stopCurrentSentence();
          stopShadowingRecording();
          onBack();
        }}
        style={{ marginBottom: "20px" }}
      >
        ← Meus vídeos
      </button>

      {/* ==============================================
          VÍDEO
      ============================================== */}

      <section className="card">
        <div className="section-header">
          <div>
            <h1>{video.title || "Vídeo"}</h1>

            <p>
              Escolha uma frase para praticar.
            </p>
          </div>
        </div>

        <div className="youtube-player">
          <YouTube
            videoId={youtubeId}
            onReady={onPlayerReady}
            opts={{
              width: "100%",
              height: "500",
              playerVars: {
                autoplay: 0,
                controls: 1,
                rel: 0,
              },
            }}
          />
        </div>
      </section>

      {/* ==============================================
          FRASE SELECIONADA
      ============================================== */}

      {selectedSentenceId !== null && (
        <section className="card">
          <p
            style={{
              marginBottom: "8px",
              fontSize: "0.85rem",
              opacity: 0.7,
            }}
          >
            Frase selecionada
          </p>

          {video.sentences
            .filter((sentence) => sentence.id === selectedSentenceId)
            .map((sentence) => (
              <div key={sentence.id}>
                <h2>{sentence.text}</h2>

                <p>
                  {formatTime(sentence.start_time)}
                  {" — "}
                  {formatTime(sentence.end_time)}
                </p>

                <div className="sentence-actions">
                  <button
                    type="button"
                    onClick={() => playSentence(sentence)}
                    disabled={recording || processingShadowing}
                  >
                    {playingSentenceId === sentence.id
                      ? "⏸ Reproduzindo..."
                      : "▶ Ouvir novamente"}
                  </button>

                  <button
                    type="button"
                    onClick={() => startShadowing(sentence)}
                    disabled={recording || processingShadowing}
                  >
                    🎙️ Shadowing
                  </button>
                </div>
              </div>
            ))}
        </section>
      )}

      {/* ==============================================
          SHADOWING EM ANDAMENTO
      ============================================== */}

      {recording && selectedShadowingSentence && (
        <section className="card shadowing-recording">
          <div className="recording-indicator">
            🔴 Gravando...
          </div>

          <p>
            Fale junto com a frase:
          </p>

          <strong>
            {selectedShadowingSentence.text}
          </strong>

          <p style={{ opacity: 0.7 }}>
            A gravação termina automaticamente quando a frase acabar.
          </p>

          <button
            type="button"
            onClick={stopShadowingRecording}
          >
            ⏹ Finalizar agora
          </button>
        </section>
      )}

      {/* ==============================================
          PROCESSANDO SHADOWING
      ============================================== */}

      {processingShadowing && (
        <section className="card shadowing-processing">
          <p>
            🧠 Analisando sua fala com Whisper...
          </p>
        </section>
      )}

      {/* ==============================================
          RESULTADO SHADOWING
      ============================================== */}

      {shadowingResult && !processingShadowing && (
        <section className="card shadowing-result">
          <h2>Resultado do Shadowing</h2>

          <div>
            <strong>Frase original</strong>
            <p>{shadowingResult.expected_text}</p>
          </div>

          <div>
            <strong>Você falou</strong>
            <p>{shadowingResult.recognized_text || "Não foi possível reconhecer sua fala."}</p>
          </div>

          <div className="shadowing-score">
            <span>Similaridade</span>
            <strong>
              {shadowingResult.similarity_score.toFixed(0)}%
            </strong>
          </div>

          <div className="shadowing-score">
            <span>Score</span>
            <strong>
              {shadowingResult.score.toFixed(0)}%
            </strong>
          </div>
        </section>
      )}

      {/* ==============================================
          PALAVRA SELECIONADA
      ============================================== */}

      {selectedWord && (
        <section className="card word-card">
          <div className="section-header">
            <div>
              <span
                style={{
                  fontSize: "0.85rem",
                  opacity: 0.6,
                }}
              >
                Palavra
              </span>

              <h2>{selectedWord}</h2>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedWord(null);
                setWordDefinition(null);
              }}
            >
              Fechar
            </button>
          </div>

          {loadingWord && (
            <p>Consultando dicionário...</p>
          )}

          {wordError && (
            <p className="error">{wordError}</p>
          )}

          {wordDefinition && (
            <div>
              {wordDefinition.ipa && (
                <div>
                  <strong>IPA</strong>
                  <p>{wordDefinition.ipa}</p>
                </div>
              )}

              {wordDefinition.part_of_speech && (
                <div>
                  <strong>Classe gramatical</strong>
                  <p>{wordDefinition.part_of_speech}</p>
                </div>
              )}

              {wordDefinition.meaning && (
                <div>
                  <strong>Definition</strong>
                  <p>{wordDefinition.meaning}</p>
                </div>
              )}

              {wordDefinition.example && (
                <div>
                  <strong>Example</strong>
                  <p>{wordDefinition.example}</p>
                </div>
              )}

              <button
                type="button"
                onClick={async () => {
                  await api.saveVocabulary({
                    word: wordDefinition.word,
                    ipa: wordDefinition.ipa,
                    meaning: wordDefinition.meaning,
                    example: wordDefinition.example,
                  });
                }}
              >
                🧠 Adicionar à memória
              </button>
            </div>
          )}
        </section>
      )}

      {/* ==============================================
          FRASES
      ============================================== */}

      <section className="card">
        <div className="section-header">
          <div>
            <h2>Frases</h2>

            <p>
              As frases são geradas automaticamente pelo Whisper.
            </p>
          </div>

          <button
            type="button"
            onClick={transcribe}
            disabled={transcribing || recording || processingShadowing}
          >
            {transcribing
              ? "Transcrevendo..."
              : "🎙️ Gerar frases"}
          </button>
        </div>

        {transcriptionMessage && (
          <p className="success">
            {transcriptionMessage}
          </p>
        )}

        {video.sentences.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💬</div>

            <h3>Nenhuma frase cadastrada</h3>

            <p>
              Clique em "Gerar frases" para utilizar o Whisper.
            </p>
          </div>
        ) : (
          <div className="sentence-list">
            {video.sentences.map((sentence, index) => {
              const selected =
                selectedSentenceId === sentence.id;

              const playing =
                playingSentenceId === sentence.id;

              return (
                <article
                  className="sentence-item"
                  key={sentence.id}
                  onClick={() => selectSentence(sentence)}
                  style={{
                    cursor: "pointer",
                    border: selected
                      ? "2px solid currentColor"
                      : undefined,
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: "0.8rem",
                        opacity: 0.6,
                      }}
                    >
                      Frase {index + 1}
                    </span>

                    <p className="sentence-text">
                      {renderSentenceWords(sentence.text)}
                    </p>

                    <span className="sentence-time">
                      {formatTime(sentence.start_time)}
                      {" — "}
                      {formatTime(sentence.end_time)}
                    </span>
                  </div>

                  <div className="sentence-actions">
                    <button
                      type="button"
                      disabled={recording || processingShadowing}
                      onClick={(event) => {
                        event.stopPropagation();
                        playSentence(sentence);
                      }}
                    >
                      {playing ? "⏸" : "▶ Praticar"}
                    </button>

                    <button
                      type="button"
                      disabled={recording || processingShadowing}
                      onClick={(event) => {
                        event.stopPropagation();
                        startShadowing(sentence);
                      }}
                    >
                      🎙️ Shadowing
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
