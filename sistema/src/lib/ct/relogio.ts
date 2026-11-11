"use client";
import { useEffect, useState } from "react";
export function useRelogio() {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setAgora(Date.now()), 30000); return () => clearInterval(timer); }, []);
  return agora;
}
