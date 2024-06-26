{
  inputs = { utils.url = "github:numtide/flake-utils"; };
  outputs = { self, nixpkgs, utils }:
    utils.lib.eachDefaultSystem (system:
      let pkgs = import nixpkgs { inherit system; };
      in {
        devShell = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            nodejs
            nodePackages.typescript-language-server
            nodePackages.prettier
          ];
        };

        packages.default = pkgs.callPackage ./default.nix {
          nodeOutputHash =
            "sha256-Z10u5PVyNiuODMLD5QcmWLEA4OkO8xoOo8giViA8+Uk=";
        };
      });
}
