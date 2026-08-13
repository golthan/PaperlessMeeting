const { getDefaultConfig } = require("expo/metro-config");
const fs = require("fs");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Dự án dùng npm workspaces nên chỉ được phép tồn tại MỘT bản react cho cả
// monorepo (overrides ở package.json gốc ghim react 19.1.0). Tùy trạng thái
// hoisting, react có thể nằm ở mobile/node_modules hoặc node_modules gốc.
// Ép mọi import "react" về đúng một bản để tránh lỗi
// "Incompatible React versions" lúc runtime.
const candidates = [
  path.resolve(__dirname, "node_modules/react"),
  path.resolve(__dirname, "..", "node_modules/react")
];
const reactRoot = candidates.find((dir) => fs.existsSync(dir));

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (reactRoot && (moduleName === "react" || moduleName.startsWith("react/"))) {
    const subpath = moduleName === "react" ? "" : moduleName.slice("react".length);
    return context.resolveRequest(context, reactRoot + subpath, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
