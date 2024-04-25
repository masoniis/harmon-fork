{ stdenv, lib, bun, makeBinaryWrapper }:
let
  src = ./.;
  version = "pre-alpha";
  node_modules = stdenv.mkDerivation {
    pname = "haron-node_modules";
    inherit src version;
    impureEnvVars = lib.fetchers.proxyImpureEnvVars
      ++ [ "GIT_PROXY_COMMAND" "SOCKS_SERVER" ];
    nativeBuildInputs = [ bun ];
    dontConfigure = true;
    buildPhase = ''
      bun install --no-progress --frozen-lockfile
    '';
    installPhase = ''
      mkdir -p $out/node_modules

      cp -R ./node_modules $out
    '';
    outputHash = "sha256-lYR39rBoKsL6Yl3uC94yzDSI9HlvQf/s4jbF7D/Y2OU=";
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
  };
in stdenv.mkDerivation {
  pname = "harmon";
  inherit src version;
  nativeBuildInputs = [ makeBinaryWrapper ];

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/bin

    ln -s ${node_modules}/node_modules $out
    cp -R ./* $out

    # bun is referenced naked in the package.json generated script
    makeBinaryWrapper ${bun}/bin/bun $out/bin/harmon \
      --prefix PATH : ${lib.makeBinPath [ bun ]} \
      --add-flags "run --prefer-offline --no-install --cwd $out ./src/index.ts"

    runHook postInstall
  '';
}
