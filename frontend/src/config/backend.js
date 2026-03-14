const FALLBACK_BACKEND_URL = 'https://alluz-backend-998004835337.us-central1.run.app';

const normalizeBaseUrl = (value) => {
  if (!value || value === 'undefined' || value === 'null') {
    return FALLBACK_BACKEND_URL;
  }

  return value.endsWith('/') ? value.slice(0, -1) : value;
};

export const BACKEND_URL = normalizeBaseUrl(process.env.REACT_APP_BACKEND_URL);
export const API_URL = `${BACKEND_URL}/api`;
