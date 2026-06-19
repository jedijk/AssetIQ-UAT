// craco.config.js
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
require("dotenv").config();

// Check if we're in development/preview mode (not production build)
// Craco sets NODE_ENV=development for start, NODE_ENV=production for build
const isDevServer = process.env.NODE_ENV !== "production";

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
};

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

/** Downlevel kiosk bundle syntax for Samsung Tizen / legacy TV Chromium (~56+). */
function kioskLegacyDownlevelPlugin() {
  let esbuild;
  try {
    esbuild = require("esbuild");
  } catch (_err) {
    console.warn("[kiosk] esbuild not installed — TV bundle will not be downleveled.");
    return { apply() {} };
  }

  return {
    apply(compiler) {
      const { webpack } = compiler;
      const { Compilation } = webpack;

      compiler.hooks.thisCompilation.tap("KioskLegacyDownlevelPlugin", (compilation) => {
        compilation.hooks.processAssets.tap(
          {
            name: "KioskLegacyDownlevelPlugin",
            stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
          },
          () => {
            for (const name of Object.keys(compilation.assets)) {
              if (!/^static\/js\/kiosk\.[^.]+\.js$/.test(name)) continue;

              const asset = compilation.getAsset(name);
              const source = asset.source.source().toString();
              const { code } = esbuild.transformSync(source, {
                target: "chrome56",
                loader: "js",
                legalComments: "none",
              });

              compilation.updateAsset(
                name,
                new webpack.sources.RawSource(code),
                { minimized: true },
              );
            }
          },
        );
      });
    },
  };
}

let webpackConfig = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        // CRA treats warnings as errors in CI (e.g. Vercel), so keep this visible
        // for local dev while not breaking production builds.
        "react-hooks/exhaustive-deps": process.env.CI ? "off" : "warn",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {
      // Reduce production console noise and avoid worker sourcemap fetches
      // like "blob://nullhttps//...worker.js.map" on iOS/Chromium.
      if (process.env.NODE_ENV === "production") {
        webpackConfig.devtool = false;

        // Lightweight kiosk bundle for Samsung TV / display routes (tv.html).
        const mainEntry = webpackConfig.entry;
        webpackConfig.entry = {
          main: mainEntry,
          kiosk: path.resolve(__dirname, "src/kiosk/index.js"),
        };

        webpackConfig.plugins = webpackConfig.plugins.map((plugin) => {
          if (plugin instanceof HtmlWebpackPlugin) {
            return new HtmlWebpackPlugin({
              ...plugin.options,
              chunks: ["main"],
              filename: "index.html",
            });
          }
          return plugin;
        });

        webpackConfig.plugins.push(
          new HtmlWebpackPlugin({
            inject: true,
            chunks: ["kiosk"],
            template: path.resolve(__dirname, "public/tv.html"),
            filename: "tv.html",
          }),
          kioskLegacyDownlevelPlugin(),
        );
      }

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }
      return webpackConfig;
    },
  },
};

webpackConfig.devServer = (devServerConfig) => {
  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  return devServerConfig;
};

// Wrap with visual edits (automatically adds babel plugin, dev server, and overlay in dev mode)
if (isDevServer) {
  try {
    const { withVisualEdits } = require("@emergentbase/visual-edits/craco");
    webpackConfig = withVisualEdits(webpackConfig);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes('@emergentbase/visual-edits/craco')) {
      console.warn(
        "[visual-edits] @emergentbase/visual-edits not installed — visual editing disabled."
      );
    } else {
      throw err;
    }
  }
}

module.exports = webpackConfig;
