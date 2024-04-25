{
  inputs = { utils.url = "github:numtide/flake-utils"; };
  outputs = { self, nixpkgs, utils }:
    utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [
            (self: super: {
              bun = super.bun.overrideAttrs (final: prev: {
                src = pkgs.fetchurl {
                  url =
                    "https://github.com/oven-sh/bun/releases/download/bun-v${prev.version}/bun-linux-x64-baseline.zip";
                  hash = "sha256-EKl1neLZfjfSNax2HDFSiO4XGuxMDR6Mom8NnVq7DSY=";
                };
              });
            })
          ];
        };
      in {
        devShell = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            nodejs
            nodePackages.typescript-language-server
            nodePackages.prettier
          ];
        };

        packages.default = pkgs.callPackage ./default.nix { };
      });
}
