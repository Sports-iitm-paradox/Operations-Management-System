import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
export const useMe = (): any => useQuery({ queryKey: ["me"], queryFn: () => api("/auth/me"), staleTime: 60000 }).data;
export const ASSIGNERS = ["CORE", "DEPUTY_CORE"], MANAGERS = ["CORE", "DEPUTY_CORE", "SUPER_COORDINATOR", "COORDINATOR"];
export const LIVE = { refetchInterval: 20000 };  // serverless hosting cannot hold WebSockets, so live views poll (paused while the tab is hidden)
