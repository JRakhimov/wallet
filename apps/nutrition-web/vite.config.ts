import { miniAppViteConfig } from "../../packages/ui/vite/mini-app-config";

export default miniAppViteConfig(new URL(".", import.meta.url), {
  port: 5174,
  allowedHosts: ["nutrition.y3110w.com", "test-web2.y3110w.com"],
});
