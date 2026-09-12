# Galeria de personagens

- `HeroGallery.ts`: seleção, filtros, abas de detalhes/habilidades/lore e acesso aos baralhos e ao treinamento.
- `GalleryViewer.ts`: visualização 3D e modelos provisórios da galeria.
- `gallery.css`: aparência e comportamento responsivo.
- `presentation.ts`: reúne as configurações visuais dos personagens e o portrait reservado.

Para mudar os atributos ou a história de um personagem, edite `src/characters/<id>/definition.ts`.
Para mudar portrait, logo ou enquadramento, edite `src/characters/<id>/presentation.ts`.
Os arquivos de imagem ficam em `public/assets/characters/<id>/`.

Os ícones reutilizáveis estão em `src/ui/shared/icons.ts`; os nomes das funções estão em `src/characters/roles.ts`.

Validação: `node tests/browser/gallery-smoke.mjs` com Vite em execução.
