import axios, { AxiosInstance } from "axios"
import AsyncStorage from "@react-native-async-storage/async-storage"

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"

const ACCESS_KEY = "intellabets_access_token"
const REFRESH_KEY = "intellabets_refresh_token"

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 15_000,
})

// Attach the bearer token to every request.
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(ACCESS_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Transparently refresh on 401, retrying the original request once.
let refreshing: Promise<string | null> | null = null

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      refreshing ??= refreshAccessToken()
      const newToken = await refreshing
      refreshing = null
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      }
    }
    return Promise.reject(error)
  }
)

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await AsyncStorage.getItem(REFRESH_KEY)
  if (!refreshToken) return null
  try {
    const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken })
    await AsyncStorage.setItem(ACCESS_KEY, data.accessToken)
    await AsyncStorage.setItem(REFRESH_KEY, data.refreshToken)
    return data.accessToken as string
  } catch {
    await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY])
    return null
  }
}

export async function saveTokens(accessToken: string, refreshToken: string) {
  await AsyncStorage.multiSet([
    [ACCESS_KEY, accessToken],
    [REFRESH_KEY, refreshToken],
  ])
}

export async function clearTokens() {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY])
}
