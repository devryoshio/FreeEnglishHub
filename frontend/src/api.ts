const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:8000";

async function request(
  path: string,
  options: RequestInit = {},
) {
  const response = await fetch(
    `${API_URL}${path}`,
    {
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : {
              "Content-Type": "application/json",
            }),
        ...(options.headers || {}),
      },
      credentials: "include",
    },
  );

  const text = await response.text();

  let data: any = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    console.error(
      "API ERROR:",
      response.status,
      data,
    );

    const detail =
      data?.detail ?? data;

    throw new Error(
      typeof detail === "string"
        ? detail
        : JSON.stringify(detail),
    );
  }

  return data;
}



export const api = {
  // -------------------------------
  // Autenticação
  // -------------------------------

  register: (email: string, password: string) =>
    request("/auth/register", {
      method: "POST",

      body: JSON.stringify({
        email,
        password,
      }),
    }),

  login: (email: string, password: string) =>
    request("/auth/login", {
      method: "POST",

      body: JSON.stringify({
        email,
        password,
      }),
    }),

  me: () =>
    request("/auth/me"),

  logout: () =>
    request("/auth/logout", {
      method: "POST",
    }),

  // -------------------------------
  // Vídeos
  // -------------------------------

  videos: () =>
    request("/videos"),

  createVideo: (
    video_url: string,
    title?: string
  ) =>
    request("/videos", {
      method: "POST",

      body: JSON.stringify({
        video_url,
        title,
      }),
    }),

  getVideo: (videoId: number) =>
    request(`/videos/${videoId}`),

  getVideoStream: (videoId: number) =>
    request(`/videos/${videoId}/stream`),

  // -------------------------------
  // Frases
  // -------------------------------

  createSentence: (
    videoId: number,
    text: string,
    start_time: number,
    end_time: number
  ) =>
    request(`/videos/${videoId}/sentences`, {
      method: "POST",

      body: JSON.stringify({
        text,
        start_time,
        end_time,
      }),
    }),

  // -------------------------------
  // Dashboard
  // -------------------------------

  dashboard: () =>
    request("/dashboard"),


transcribeVideo: (videoId: number) =>
  request(`/videos/${videoId}/transcribe`, {
    method: "POST",
  }),


  lookupWord: (word: string) =>
  request(
    `/vocabulary/lookup/${encodeURIComponent(word)}`
  ),

saveVocabulary: (data: {
  word: string;
  ipa?: string | null;
  meaning?: string | null;
  example?: string | null;
}) =>
  request("/vocabulary", {
    method: "POST",
    body: JSON.stringify(data),
  }),

shadowing: async (
  sentenceId: number,
  audioBlob: Blob,
) => {
  const formData = new FormData();

  formData.append(
    "audio",
    audioBlob,
    "shadowing.webm",
  );

  return request(
    `/practice/${sentenceId}/shadowing`,
    {
      method: "POST",
      body: formData,
    },
  );
},


};


