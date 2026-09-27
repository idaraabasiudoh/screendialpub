// Vanta's ES module source: its dist build is UMD, whose default doesn't survive CJS interop
declare module "vanta/src/vanta.waves.js" {
  const WAVES: (options: Record<string, unknown>) => unknown;
  export default WAVES;
}

// three r134 ships no types; only handed through to Vanta
declare module "three";
