# Research: Python-to-web UI frameworks

Projects where the GUI is declared in code (Python) and rendered as a web app.

- **Streamlit**: the best-known one. You write a plain Python script and it renders as a web app.
- **Gradio**: similar to Streamlit but aimed at ML demos. It builds UIs from Python functions, with `Blocks` for
  layouts.
- **NiceGUI**: you declare the UI in Python (Vue/Quasar and FastAPI underneath), with a more component-tree style than
  Streamlit.
- **Reflex** (formerly Pynecone): a declarative component tree in pure Python that compiles to React/Next.js. It's the
  closest to our React setup.
