/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ose: {
          navy: '#0B1F3A',
          blue: '#0B73D9',
          sky: '#EAF4FF',
          line: '#D9E5F2'
        }
      },
      boxShadow: {
        soft: '0 12px 30px rgba(15, 43, 78, 0.08)'
      }
    }
  },
  plugins: []
};
