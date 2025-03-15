/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        'notification-slide': {
          '0%': { 
            transform: 'translateY(-100%) translateX(100%) scale(0.5)',
            opacity: '0' 
          },
          '15%': { 
            transform: 'translateY(0) translateX(0) scale(1.1)',
            opacity: '0.8' 
          },
          '25%': { 
            transform: 'translateY(-10px) translateX(0) scale(1)',
            opacity: '1' 
          },
          '75%': { 
            transform: 'translateY(-10px) translateX(0) scale(1)',
            opacity: '1' 
          },
          '85%': { 
            transform: 'translateY(-5px) translateX(0) scale(0.95)',
            opacity: '0.8' 
          },
          '100%': { 
            transform: 'translateY(0) translateX(100%) scale(0.9)',
            opacity: '0' 
          }
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' }
        },
        'glow': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(59, 130, 246, 0.5)' },
          '50%': { boxShadow: '0 0 15px rgba(59, 130, 246, 0.8)' }
        }
      },
      animation: {
        'notification-slide': 'notification-slide 2s ease-in-out',
        'float': 'float 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite'
      }
    },
  },
  plugins: [],
};