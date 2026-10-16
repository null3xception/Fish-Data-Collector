/** Build: npx tailwindcss@3 -c src/tailwind.config.js -i src/input.css -o tailwind.css --minify */
module.exports = {
  content: ['./index.html', './app.js'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#0b5d7a', light: '#0e7c9f', dark: '#073f54' },
        ink: '#12303b',
        mist: '#eef4f7',
        line: '#d3e0e6',
      },
    },
  },
  plugins: [],
};
