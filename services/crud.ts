import { api } from "./api";

type Endpoints = {
  list: string;
  create: string;
  update: string;
};

export function createCrudService<T>(endpoints: Endpoints) {
  return {
    list: async (): Promise<T[]> => {
      const response = await api.post(endpoints.list);
      const data = response.data;
      const list = Array.isArray(data) ? data : (data?.data ?? []);
      return Array.isArray(list) ? (list as T[]) : [];
    },
    create: async (payload: Partial<T>): Promise<T> => {
      const response = await api.post(endpoints.create, payload);
      const data = response.data;
      const base = Array.isArray(data) ? data[0] : (data?.data ?? data);
      return base as T;
    },
    update: async (
      payload: Partial<T> & { id?: string | null },
    ): Promise<T> => {
      const response = await api.post(endpoints.update, payload);
      const data = response.data;
      const base = Array.isArray(data) ? data[0] : (data?.data ?? data);
      return base as T;
    },
  };
}
