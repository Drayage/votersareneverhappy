/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages는 https://drayage.github.io/votersareneverhappy/ 하위에서 서빙되므로
// 빌드 시에만 base 를 저장소 하위 경로로 설정한다. (dev/test 는 루트 유지)
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/votersareneverhappy/" : "/",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
}));
