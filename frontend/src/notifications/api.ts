export type CustomerNotification = {
  notificationId: string;
  orderId: string | null;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/notifications${path}`, { ...init, credentials: "same-origin" });
  } catch {
    throw new Error("Can't reach the server. Please try again.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Something went wrong. Please try again.");
  return data as T;
}

export async function fetchNotifications() {
  return (await request<{ notifications: CustomerNotification[] }>("/")).notifications;
}

export async function markNotificationRead(notificationId: string) {
  return request<{ notificationId: string; isRead: boolean }>(
    `/${encodeURIComponent(notificationId)}/read`,
    { method: "PATCH" },
  );
}
