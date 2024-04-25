{ lib, pkgs, stdenv }:

stdenv.mkDerivation {
  pname = "harmon";
  version = "pre-alpha";

  src = ./.;

  nativeBuildInputs = with pkgs; [ bun makeBinaryWrapper wget ];

  dontConfigure = true;
  buildPhase = ''
    bun install --no-progress --frozen-lockfile
  '';
  installPhase = ''
    cp -r . $out
    makeBinaryWrapper ${pkgs.bun}/bin/bun $out/bin/harmon \
      --prefix PATH : ${lib.makeBinPath [ pkgs.bun ]} \
      --add-flags "run --prefer-offline --no-install index.ts"
  '';
}
