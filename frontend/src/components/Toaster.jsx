import { Toaster } from 'react-hot-toast'

export default function FloatingNotification() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 4000,
        dismissible: true,
        style: {
          borderRadius: '8px',
          padding: '10px 16px',
          fontSize: '14px',
        },
        success: {
          iconTheme: { primary: '#16a34a', secondary: '#fff' },
        },
        error: {
          iconTheme: { primary: '#dc2626', secondary: '#fff' },
        },
      }}
    />
  )
}
