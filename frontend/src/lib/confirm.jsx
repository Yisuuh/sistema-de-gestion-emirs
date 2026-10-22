import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const resolveRef = useRef(null)

  const confirm = useCallback(({ title = '¿Continuar?', message = '', variant = 'default' } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setDialog({ title, message, variant })
    })
  }, [])

  const handleResolve = (value) => {
    resolveRef.current?.(value)
    setDialog(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => handleResolve(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-800 mb-2">{dialog.title}</h2>
            {dialog.message && (
              <p className="text-sm text-gray-500 mb-6">{dialog.message}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => handleResolve(false)}
              >
                Cancelar
              </button>
              <button
                className={`px-4 py-2 text-sm rounded-lg font-medium text-white transition-colors ${
                  dialog.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-[#df000a] hover:bg-[#b80008]'
                }`}
                onClick={() => handleResolve(true)}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return ctx
}
