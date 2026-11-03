/** Build: npx tailwindcss@3 -c src/tailwind.config.js -i src/input.css -o tailwind.css --minify */
module.exports = {
  content: ['./index.html', './app.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      colors: {
        // deep lagoon teal for everyday actions, coral (its complement) for the one primary call to action
        brand: { DEFAULT: '#0b6b6b', dark: '#084f50', soft: '#dcefec', faint: '#f1f8f7' },
        lagoon: '#0b3a3f',
        coral: { DEFAULT: '#c4471f', bright: '#e2603a', soft: '#fde8df' },
        ink: '#0e2a30',
        muted: '#51676c',
        mist: '#eef3f2',
        line: '#d6e2e0',
        danger: '#b42318',
      },
      boxShadow: {
        card: '0 1px 2px rgb(14 42 48 / 0.06), 0 2px 8px -2px rgb(14 42 48 / 0.08)',
        lift: '0 4px 12px -2px rgb(14 42 48 / 0.14), 0 2px 4px -1px rgb(14 42 48 / 0.08)',
        bar: '0 -4px 16px -4px rgb(14 42 48 / 0.10)',
      },
    },
  },
  plugins: [],
};
