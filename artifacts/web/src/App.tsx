import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import ReplitCallback from "@/pages/auth/replit-callback";
import WeChatCallback from "@/pages/auth/wechat-callback";
import GoogleCallback from "@/pages/auth/google-callback";
import Dashboard from "@/pages/dashboard";
import { ProtectedRoute } from "@/components/protected-route";
import { LanguageDetectionBanner } from "@/components/language-detection-banner";
import { DashboardLayout } from "@/components/dashboard-layout";

import Vehicles from "@/pages/vehicles/index";
import VehicleDetail from "@/pages/vehicles/[id]";
import SellerDashboard from "@/pages/seller/dashboard";
import SellerListings from "@/pages/seller/listings/index";
import SellerListingNew from "@/pages/seller/listings/new";
import SellerListingEdit from "@/pages/seller/listings/[id]/edit";
import BuyerDashboard from "@/pages/buyer/dashboard";
import BuyerFavorites from "@/pages/buyer/favorites";
import BuyerConversations from "@/pages/buyer/conversations/index";
import BuyerConversationChat from "@/pages/buyer/conversations/[id]";
import SellerConversations from "@/pages/seller/conversations/index";
import SellerConversationChat from "@/pages/seller/conversations/[id]";
import BuyerNotifications from "@/pages/buyer/notifications";
import BuyerQuotations from "@/pages/buyer/quotations/index";
import BuyerOrders from "@/pages/buyer/orders/index";
import SellerQuotations from "@/pages/seller/quotations/index";
import SellerOrders from "@/pages/seller/orders/index";
import OrderDetail from "@/pages/orders/[id]";
import AdminPayments from "@/pages/admin/payments";
import AdminDashboard from "@/pages/admin/index";
import AdminUsers from "@/pages/admin/users";
import AdminModeration from "@/pages/admin/moderation";
import AdminCommissionRules from "@/pages/admin/commission-rules";
import AdminAuditLogs from "@/pages/admin/audit-logs";
import AdminSettings from "@/pages/admin/settings";
import AdminAdmins from "@/pages/admin/admins";
import AdminReference from "@/pages/admin/reference";
import AdminQuotations from "@/pages/admin/quotations";
import AdminQuotationDetail from "@/pages/admin/quotations/[id]";
import AdminOrders from "@/pages/admin/orders";
import AdminOrderDetail from "@/pages/admin/orders/[id]";
import AdminMessages from "@/pages/admin/messages/index";
import AdminMessageDetail from "@/pages/admin/messages/[id]";
import AdminMessagesNew from "@/pages/admin/messages/new";
import AdminMailboxes from "@/pages/admin/mailboxes";
import FreightRequestsList from "@/pages/forwarder/freight-requests/index";
import FreightRequestDetail from "@/pages/forwarder/freight-requests/[requestId]";
import FreightConversationChat from "@/pages/forwarder/conversations/[id]";
import ForwarderShipmentsList from "@/pages/forwarder/shipments/index";
import ForwarderShipmentDetail from "@/pages/forwarder/shipments/[shipmentId]";
import AccountSettings from "@/pages/account/settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/auth/replit-callback" component={ReplitCallback} />
      <Route path="/auth/wechat-callback" component={WeChatCallback} />
      <Route path="/auth/google-callback" component={GoogleCallback} />
      <Route path="/vehicles" component={Vehicles} />
      <Route path="/vehicles/:vehicleId" component={VehicleDetail} />
      <Route path="/listings" component={Vehicles} />
      <Route path="/listings/:vehicleId" component={VehicleDetail} />

      {/* Role redirect hub */}
      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>

      {/* ── Seller routes ── */}
      <Route path="/seller/dashboard">
        <ProtectedRoute>
          <DashboardLayout><SellerDashboard /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/seller/listings/new">
        <ProtectedRoute>
          <DashboardLayout><SellerListingNew /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/seller/listings/:vehicleId/edit">
        <ProtectedRoute>
          <DashboardLayout><SellerListingEdit /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/seller/listings">
        <ProtectedRoute>
          <DashboardLayout><SellerListings /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/seller/conversations/:id">
        <ProtectedRoute>
          <DashboardLayout><SellerConversationChat /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/seller/conversations">
        <ProtectedRoute>
          <DashboardLayout><SellerConversations /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/seller/quotations">
        <ProtectedRoute>
          <DashboardLayout><SellerQuotations /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/seller/orders">
        <ProtectedRoute>
          <DashboardLayout><SellerOrders /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      {/* ── Buyer routes ── */}
      <Route path="/buyer/dashboard">
        <ProtectedRoute>
          <DashboardLayout><BuyerDashboard /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/buyer/favorites">
        <ProtectedRoute>
          <DashboardLayout><BuyerFavorites /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/buyer/conversations/:id">
        <ProtectedRoute>
          <DashboardLayout><BuyerConversationChat /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/buyer/conversations">
        <ProtectedRoute>
          <DashboardLayout><BuyerConversations /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/buyer/notifications">
        <ProtectedRoute>
          <DashboardLayout><BuyerNotifications /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/buyer/quotations">
        <ProtectedRoute>
          <DashboardLayout><BuyerQuotations /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/buyer/orders">
        <ProtectedRoute>
          <DashboardLayout><BuyerOrders /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      {/* ── Shared order detail ── */}
      <Route path="/orders/:id">
        <ProtectedRoute>
          <DashboardLayout><OrderDetail /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      {/* ── Admin routes (use AdminLayout internally) ── */}
      <Route path="/admin/dashboard">
        <ProtectedRoute>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute>
          <AdminUsers />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/moderation">
        <ProtectedRoute>
          <AdminModeration />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/commission-rules">
        <ProtectedRoute>
          <AdminCommissionRules />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/audit-logs">
        <ProtectedRoute>
          <AdminAuditLogs />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/settings">
        <ProtectedRoute>
          <AdminSettings />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/admins">
        <ProtectedRoute>
          <AdminAdmins />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/payments/:paymentId">
        <ProtectedRoute>
          <AdminPayments />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/payments">
        <ProtectedRoute>
          <AdminPayments />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/reference">
        <ProtectedRoute>
          <AdminReference />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/quotations/:id">
        <ProtectedRoute>
          <AdminQuotationDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/quotations">
        <ProtectedRoute>
          <AdminQuotations />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/orders/:id">
        <ProtectedRoute>
          <AdminOrderDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/orders">
        <ProtectedRoute>
          <AdminOrders />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/messages/new">
        <ProtectedRoute>
          <AdminMessagesNew />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/messages/:id">
        <ProtectedRoute>
          <AdminMessageDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/messages">
        <ProtectedRoute>
          <AdminMessages />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/mailboxes">
        <ProtectedRoute>
          <AdminMailboxes />
        </ProtectedRoute>
      </Route>

      {/* ── Forwarder routes ── */}
      <Route path="/forwarder/freight-requests/:requestId">
        <ProtectedRoute>
          <DashboardLayout><FreightRequestDetail /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/forwarder/freight-requests">
        <ProtectedRoute>
          <DashboardLayout><FreightRequestsList /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/forwarder/conversations/:id">
        <ProtectedRoute>
          <DashboardLayout><FreightConversationChat /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/forwarder/shipments/:shipmentId">
        <ProtectedRoute>
          <DashboardLayout><ForwarderShipmentDetail /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/forwarder/shipments">
        <ProtectedRoute>
          <DashboardLayout><ForwarderShipmentsList /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      {/* ── Account settings (all roles) ── */}
      <Route path="/account/settings">
        <ProtectedRoute>
          <AccountSettings />
        </ProtectedRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="ncm-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
          <SonnerToaster />
          <LanguageDetectionBanner />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
