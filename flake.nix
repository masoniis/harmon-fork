{
  inputs = { utils.url = "github:numtide/flake-utils"; };
  outputs = { self, nixpkgs, utils }:
    utils.lib.eachDefaultSystem (system:
      let pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShell = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            nodejs
            nodePackages.typescript-language-server
            nodePackages.prettier
          ];

          shellHook = ''
            ./get-htmx.sh
          '';
        };

        packages.default = pkgs.callPackage ./default.nix { };
      });
}
