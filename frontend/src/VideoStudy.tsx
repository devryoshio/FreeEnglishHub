import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
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


function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  return `${minutes}:${remaining.toFixed(2).padStart(5, "0")}`;
}

export default function VideoStudy({ videoId, onBack }: Props) {
  const [video, setVideo] = useState<Video | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [streamError, setStreamError] = useState("");
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
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [selectedShadowingSentence, setSelectedShadowingSentence] =
    useState<Sentence | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const shadowingAnimationFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const shadowingSentenceRef = useRef<Sentence | null>(null);
  const shadowingStoppingRef = useRef(false);


  // --------------------------------------------------
  // Carregar vídeo
  // --------------------------------------------------

  useEffect(() => {
    loadVideo();
    loadStream();

    return () => {
      stopCurrentSentence();
      stopShadowingRecording();
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
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

  async function loadStream() {
    try {
      const result = await api.getVideoStream(videoId);
      setStreamUrl(result.stream_url || null);
      setEmbedUrl(result.embed_url || null);
      setStreamError(result.stream_error || "");
    } catch (error) {
      setStreamUrl(null);
      setStreamError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o stream do Odysee."
      );
    }
  }

  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;

    const element = videoRef.current;

    element.crossOrigin = "anonymous";

    if (Hls.isSupported() && /\.m3u8(?:$|\?)/i.test(streamUrl)) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error("Odysee HLS error:", data);
        if (data.fatal) {
          setError(`Não foi possível reproduzir o vídeo do Odysee: ${data.details || "erro HLS"}`);
        }
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(element);

      return () => {
        hls.destroy();
      };
    }

    // Safari/iOS and direct MP4 playback.
    element.src = streamUrl;
    element.load();

    return () => {
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [streamUrl]);

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
  // Reprodução de frase
  // --------------------------------------------------

  function stopCurrentSentence() {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
    }

    setPlayingSentenceId(null);
  }

  function playSentence(sentence: Sentence) {
    if (!videoRef.current) return;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setSelectedSentenceId(sentence.id);
    setPlayingSentenceId(sentence.id);

    videoRef.current.currentTime = sentence.start_time;
    void videoRef.current.play();

    const checkTime = () => {
      const currentTime = videoRef.current?.currentTime ?? 0;

      if (currentTime >= sentence.end_time) {
        videoRef.current?.pause();
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
    if (recording || processingShadowing) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Seu navegador não permite acesso ao microfone.");
      return;
    }

    try {
      setSelectedSentenceId(sentence.id);
      setSelectedShadowingSentence(sentence);
      setShadowingResult(null);
      setRecordedAudio(null);
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
        setRecordedAudioUrl(null);
      }
      setError("");
      shadowingSentenceRef.current = sentence;
      shadowingStoppingRef.current = false;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        cleanupShadowingStream();
        mediaRecorderRef.current = null;
        setRecording(false);
        setError("Ocorreu um erro durante a gravação.");
      };

      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });

        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        cleanupShadowingStream();
        setRecording(false);

        if (blob.size === 0) {
          setError("Nenhum áudio foi capturado.");
          return;
        }

        if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
        setRecordedAudio(blob);
        setRecordedAudioUrl(URL.createObjectURL(blob));
      };

      recorder.start();
      setRecording(true);
    } catch (error) {
      cleanupShadowingStream();
      mediaRecorderRef.current = null;
      setRecording(false);
      console.error("Erro ao iniciar Shadowing:", error);

      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setError("Permissão para usar o microfone foi negada. Permita o acesso ao microfone no navegador.");
      } else {
        setError("Não foi possível iniciar o Shadowing.");
      }
    }
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

  async function submitShadowing() {
    if (!selectedShadowingSentence || !recordedAudio || processingShadowing) return;
    await sendShadowing(selectedShadowingSentence, recordedAudio);
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
  // Stream Odysee

  if (!streamUrl && !embedUrl) {
    return (
      <main className="app">
        <button type="button" onClick={onBack}>← Voltar</button>
        <section className="card">
          <h2>Carregando vídeo...</h2>
          <p>Resolvendo o stream do Odysee.</p>
          {streamError && <p className="error">{streamError}</p>}
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

        <div className="video-player">
          {streamUrl ? (
            <video
              ref={videoRef}
              controls
              playsInline
              preload="metadata"
              onError={() => {
                const mediaError = videoRef.current?.error;
                setStreamError(
                  mediaError
                    ? `Erro ao reproduzir o vídeo (código ${mediaError.code}).`
                    : "Não foi possível reproduzir o vídeo do Odysee."
                );
              }}
              style={{
                width: "100%",
                maxHeight: "500px",
                background: "#000",
              }}
            />
          ) : embedUrl ? (
            <>
              <iframe
                title={video.title || "Odysee video"}
                src={embedUrl}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                style={{
                  width: "100%",
                  aspectRatio: "16 / 9",
                  border: 0,
                  background: "#000",
                }}
              />
              <p style={{ opacity: 0.7, marginTop: "8px" }}>
                O player direto do Odysee não pôde ser resolvido; usando o player oficial como fallback.
              </p>
            </>
          ) : null}
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
                    disabled={recording || processingShadowing || !streamUrl}
                  >
                    {playingSentenceId === sentence.id
                      ? "⏸ Reproduzindo..."
                      : "▶ Ouvir novamente"}
                  </button>

                  <button
                    type="button"
                    onClick={() => startShadowing(sentence)}
                    disabled={recording || processingShadowing || !streamUrl}
                  >
                    🎙️ Começar gravação
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
          <div className="recording-indicator">🔴 Gravando...</div>
          <p>Repita a frase em voz alta:</p>
          <strong>{selectedShadowingSentence.text}</strong>
          <p style={{ opacity: 0.7 }}>A gravação só termina quando você clicar em parar.</p>
          <button type="button" onClick={stopShadowingRecording}>
            ⏹ Parar gravação
          </button>
        </section>
      )}

      {recordedAudio && recordedAudioUrl && !recording && !processingShadowing && (
        <section className="card shadowing-preview">
          <h2>Ouça sua gravação</h2>
          <p>{selectedShadowingSentence?.text}</p>
          <audio controls src={recordedAudioUrl} style={{ width: "100%" }} />
          <div className="sentence-actions" style={{ marginTop: "12px" }}>
            <button
              type="button"
              onClick={() => {
                setRecordedAudio(null);
                if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
                setRecordedAudioUrl(null);
                if (selectedShadowingSentence) void startShadowing(selectedShadowingSentence);
              }}
            >
              🎙️ Gravar novamente
            </button>
            <button type="button" onClick={submitShadowing}>
              🚀 Enviar para análise
            </button>
          </div>
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
                      disabled={recording || processingShadowing || !streamUrl}
                      onClick={(event) => {
                        event.stopPropagation();
                        playSentence(sentence);
                      }}
                    >
                      {playing ? "⏸" : "▶ Praticar"}
                    </button>

                    <button
                      type="button"
                      disabled={recording || processingShadowing || !streamUrl}
                      onClick={(event) => {
                        event.stopPropagation();
                        startShadowing(sentence);
                      }}
                    >
                      🎙️ Gravar
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
