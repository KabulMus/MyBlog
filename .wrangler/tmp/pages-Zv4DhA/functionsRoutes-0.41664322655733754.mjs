import { onRequestGet as __api_likes___slug___ts_onRequestGet } from "D:\\Folder\\Documents\\HTML\\blog\\functions\\api\\likes\\[[slug]].ts"
import { onRequestPost as __api_likes___slug___ts_onRequestPost } from "D:\\Folder\\Documents\\HTML\\blog\\functions\\api\\likes\\[[slug]].ts"

export const routes = [
    {
      routePath: "/api/likes/:slug*",
      mountPath: "/api/likes",
      method: "GET",
      middlewares: [],
      modules: [__api_likes___slug___ts_onRequestGet],
    },
  {
      routePath: "/api/likes/:slug*",
      mountPath: "/api/likes",
      method: "POST",
      middlewares: [],
      modules: [__api_likes___slug___ts_onRequestPost],
    },
  ]