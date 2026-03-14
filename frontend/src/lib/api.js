import axios from 'axios';
import { API_URL } from '../config/backend';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;

export const leadsAPI = {
  list: (params) => api.get('/leads', { params }),
  get: (id) => api.get(`/leads/${id}`),
  create: (data) => api.post('/leads', data),
  update: (id, data) => api.put(`/leads/${id}`, data),
  archive: (id) => api.put(`/leads/${id}/archive`),
};

export const dealsAPI = {
  list: (params) => api.get('/deals', { params }),
  get: (id) => api.get(`/deals/${id}`),
  update: (id, data) => api.put(`/deals/${id}`, data),
};

export const activitiesAPI = {
  list: (params) => api.get('/activities', { params }),
  create: (data) => api.post('/activities', data),
};

export const proposalsAPI = {
  list: (params) => api.get('/proposals', { params }),
  create: (data) => api.post('/proposals', data),
};

export const appointmentsAPI = {
  list: (params) => api.get('/appointments', { params }),
  create: (data) => api.post('/appointments', data),
  update: (id, data) => api.put(`/appointments/${id}`, data),
};

export const notificationsAPI = {
  list: () => api.get('/notifications'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
};

export const usersAPI = {
  list: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  resetPassword: (id, data) => api.put(`/users/${id}/password`, data),
  remove: (id) => api.delete(`/users/${id}`),
};

export const dashboardAPI = {
  getMetrics: () => api.get('/dashboard/metrics'),
};


export const followUpCadenceAPI = {
  get: (dealId) => api.get(`/follow-up-cadences/${dealId}`),
  pause: (dealId) => api.put(`/follow-up-cadences/${dealId}/pause`),
  resume: (dealId) => api.put(`/follow-up-cadences/${dealId}/resume`),
  attempt: (dealId, dia, data) => api.post(`/follow-up-cadences/${dealId}/tasks/${dia}/attempt`, data),
  complete: (dealId, dia, data) => api.post(`/follow-up-cadences/${dealId}/tasks/${dia}/complete`, data),
};

export const whatsappAPI = {
  getTemplates: () => api.get('/whatsapp/templates'),
  generateLink: (params) => api.post('/whatsapp/link', params),
};
