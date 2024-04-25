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

        packages.default = pkgs.callPackage ./default.nix { };
      });
}
