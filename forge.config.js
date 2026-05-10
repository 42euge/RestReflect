module.exports = {
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
  ],
  packagerConfig: {
    icon: "./public/mindreflect",
  },
};
