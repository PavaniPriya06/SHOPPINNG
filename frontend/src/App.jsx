import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';

// Lazy load pages for code-splitting
const ProductPage = lazy(() => import('./pages/ProductPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const CheckoutSuccessPage = lazy(() => import('./pages/CheckoutSuccessPage'));
const PaymentCallbackPage = lazy(() => import('./pages/PaymentCallbackPage'));
const PaymentFailurePage = lazy(() => import('./pages/PaymentFailurePage'));
const AdminSettings = lazy(() => import('./pages/AdminSettings'));

// Loading spinner component
function LoadingSpinner() {
    return <div className="flex h-screen items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold"></div></div>;
}

// OAuth callback handler
function OAuthCallback() {
    const [params] = useSearchParams();
    const { handleOAuthCallback } = useAuth();
    useEffect(() => {
        const token = params.get('token');
        if (token) handleOAuthCallback(token);
        window.location.href = '/';
    }, []);
    return <LoadingSpinner />;
}

function ProtectedRoute({ children, adminOnly = false }) {
    const { user, isAdmin } = useAuth();
    if (!user) return <Navigate to="/auth" replace />;
    if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
    return children;
}

function Layout({ children }) {
    return (
        <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
        </div>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <CartProvider>
                    <Routes>
                        <Route path="/" element={<Layout><LandingPage /></Layout>} />
                        <Route path="/product/:id" element={<Suspense fallback={<LoadingSpinner />}><Layout><ProductPage /></Layout></Suspense>} />
                        <Route path="/auth" element={<Suspense fallback={<LoadingSpinner />}><AuthPage /></Suspense>} />
                        <Route path="/auth/callback" element={<OAuthCallback />} />
                        <Route path="/cart" element={<Suspense fallback={<LoadingSpinner />}><Layout><ProtectedRoute><CartPage /></ProtectedRoute></Layout></Suspense>} />
                        <Route path="/orders" element={<Suspense fallback={<LoadingSpinner />}><Layout><ProtectedRoute><OrdersPage /></ProtectedRoute></Layout></Suspense>} />
                        <Route path="/order-success/:orderId" element={<Suspense fallback={<LoadingSpinner />}><ProtectedRoute><CheckoutSuccessPage /></ProtectedRoute></Suspense>} />
                        <Route path="/checkout-success/:orderId" element={<Suspense fallback={<LoadingSpinner />}><ProtectedRoute><CheckoutSuccessPage /></ProtectedRoute></Suspense>} />
                        <Route path="/payment-callback/:orderId" element={<Suspense fallback={<LoadingSpinner />}><PaymentCallbackPage /></Suspense>} />
                        <Route path="/payment-failed/:orderId" element={<Suspense fallback={<LoadingSpinner />}><PaymentFailurePage /></Suspense>} />
                        <Route path="/admin/login" element={<Suspense fallback={<LoadingSpinner />}><AdminLogin /></Suspense>} />
                        <Route path="/admin" element={<Suspense fallback={<LoadingSpinner />}><ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute></Suspense>} />
                        <Route path="/admin/settings" element={<Suspense fallback={<LoadingSpinner />}><ProtectedRoute adminOnly><AdminSettings /></ProtectedRoute></Suspense>} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </CartProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}
