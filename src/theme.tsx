import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react'

type Theme = 'light' | 'dark'
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void }>({ theme: 'dark', setTheme: () => undefined })

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('avendor-theme') as Theme | null) ?? 'dark')
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.dataset.theme = theme; localStorage.setItem('avendor-theme', theme) }, [theme])
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
