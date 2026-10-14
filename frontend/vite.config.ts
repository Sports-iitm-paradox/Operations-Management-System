import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], build: { sourcemap: false, target: "es2020", rollupOptions: { output: { manualChunks: { vendor: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"] } } } }, server: { proxy: { "/api": "http://localhost:8000" } } });
