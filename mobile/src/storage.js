import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_KEY = "paperless_meeting_session";

export async function saveSession(session) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function getStoredSession() {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
}

