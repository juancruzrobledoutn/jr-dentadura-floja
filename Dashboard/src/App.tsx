import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { useInitializeStaffRoles } from './hooks/useInitializeStaffRoles'

// Lazy load all pages for better performance and code splitting
const LoginPage = lazy(() => import('./pages/Login'))
const DashboardPage = lazy(() => import('./pages/Dashboard'))
const RestaurantPage = lazy(() => import('./pages/Restaurant'))
const BranchesPage = lazy(() => import('./pages/Branches'))
const TablesPage = lazy(() => import('./pages/Tables'))
const StaffPage = lazy(() => import('./pages/Staff'))
const RolesPage = lazy(() => import('./pages/Roles'))
const OrdersPage = lazy(() => import('./pages/Orders'))
const CategoriesPage = lazy(() => import('./pages/Categories'))
const SubcategoriesPage = lazy(() => import('./pages/Subcategories'))
const ProductsPage = lazy(() => import('./pages/Products'))
const PricesPage = lazy(() => import('./pages/Prices'))
const AllergensPage = lazy(() => import('./pages/Allergens'))
const BadgesPage = lazy(() => import('./pages/Badges'))
const SealsPage = lazy(() => import('./pages/Seals'))
const PromotionTypesPage = lazy(() => import('./pages/PromotionTypes'))
const PromotionsPage = lazy(() => import('./pages/Promotions'))
const ProductExclusionsPage = lazy(() => import('./pages/ProductExclusions'))
const CustomizationsPage = lazy(() => import('./pages/Customizations'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const SalesPage = lazy(() => import('./pages/Sales'))
const HistoryBranchesPage = lazy(() => import('./pages/HistoryBranches'))
const HistoryCustomersPage = lazy(() => import('./pages/HistoryCustomers'))
const KitchenPage = lazy(() => import('./pages/Kitchen'))
const RecipesPage = lazy(() => import('./pages/Recipes'))
const IngredientsPage = lazy(() => import('./pages/Ingredients'))
const InventoryPage = lazy(() => import('./pages/Inventory'))
const SuppliersPage = lazy(() => import('./pages/Suppliers'))
const CashRegisterPage = lazy(() => import('./pages/CashRegister'))
const TipsPage = lazy(() => import('./pages/Tips'))
const FiscalPage = lazy(() => import('./pages/Fiscal'))
const SchedulingPage = lazy(() => import('./pages/Scheduling'))
const CRMPage = lazy(() => import('./pages/CRM'))
const FloorPlanPage = lazy(() => import('./pages/FloorPlan'))
const ReservationsPage = lazy(() => import('./pages/Reservations'))
const DeliveryPage = lazy(() => import('./pages/Delivery'))
const AuditLogPage = lazy(() => import('./pages/AuditLog'))

// Loading fallback component for Suspense
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64" role="status">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-zinc-400">Cargando...</span>
        <span className="sr-only">Cargando página</span>
      </div>
    </div>
  )
}

function App() {
  // Initialize staff roles on app startup
  useInitializeStaffRoles()

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public Route - Login */}
          <Route
            path="/login"
            element={
              <Suspense fallback={<PageLoader />}>
                <LoginPage />
              </Suspense>
            }
          />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={
                <Suspense fallback={<PageLoader />}>
                  <DashboardPage />
                </Suspense>
              }
            />
            <Route
              path="restaurant"
              element={
                <Suspense fallback={<PageLoader />}>
                  <RestaurantPage />
                </Suspense>
              }
            />
            <Route
              path="branches"
              element={
                <Suspense fallback={<PageLoader />}>
                  <BranchesPage />
                </Suspense>
              }
            />
            <Route
              path="branches/tables"
              element={
                <Suspense fallback={<PageLoader />}>
                  <TablesPage />
                </Suspense>
              }
            />
            <Route
              path="branches/staff"
              element={
                <Suspense fallback={<PageLoader />}>
                  <StaffPage />
                </Suspense>
              }
            />
            <Route
              path="branches/staff/roles"
              element={
                <Suspense fallback={<PageLoader />}>
                  <RolesPage />
                </Suspense>
              }
            />
            <Route
              path="branches/orders"
              element={
                <Suspense fallback={<PageLoader />}>
                  <OrdersPage />
                </Suspense>
              }
            />
            <Route
              path="kitchen"
              element={
                <Suspense fallback={<PageLoader />}>
                  <KitchenPage />
                </Suspense>
              }
            />
            <Route
              path="recipes"
              element={
                <Suspense fallback={<PageLoader />}>
                  <RecipesPage />
                </Suspense>
              }
            />
            <Route
              path="ingredients"
              element={
                <Suspense fallback={<PageLoader />}>
                  <IngredientsPage />
                </Suspense>
              }
            />
            <Route
              path="inventory"
              element={
                <Suspense fallback={<PageLoader />}>
                  <InventoryPage />
                </Suspense>
              }
            />
            <Route
              path="suppliers"
              element={
                <Suspense fallback={<PageLoader />}>
                  <SuppliersPage />
                </Suspense>
              }
            />
            <Route
              path="categories"
              element={
                <Suspense fallback={<PageLoader />}>
                  <CategoriesPage />
                </Suspense>
              }
            />
            <Route
              path="subcategories"
              element={
                <Suspense fallback={<PageLoader />}>
                  <SubcategoriesPage />
                </Suspense>
              }
            />
            <Route
              path="products"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ProductsPage />
                </Suspense>
              }
            />
            <Route
              path="prices"
              element={
                <Suspense fallback={<PageLoader />}>
                  <PricesPage />
                </Suspense>
              }
            />
            <Route
              path="allergens"
              element={
                <Suspense fallback={<PageLoader />}>
                  <AllergensPage />
                </Suspense>
              }
            />
            <Route
              path="badges"
              element={
                <Suspense fallback={<PageLoader />}>
                  <BadgesPage />
                </Suspense>
              }
            />
            <Route
              path="seals"
              element={
                <Suspense fallback={<PageLoader />}>
                  <SealsPage />
                </Suspense>
              }
            />
            <Route
              path="promotion-types"
              element={
                <Suspense fallback={<PageLoader />}>
                  <PromotionTypesPage />
                </Suspense>
              }
            />
            <Route
              path="promotions"
              element={
                <Suspense fallback={<PageLoader />}>
                  <PromotionsPage />
                </Suspense>
              }
            />
            <Route
              path="product-exclusions"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ProductExclusionsPage />
                </Suspense>
              }
            />
            <Route
              path="customizations"
              element={
                <Suspense fallback={<PageLoader />}>
                  <CustomizationsPage />
                </Suspense>
              }
            />
            <Route
              path="statistics/sales"
              element={
                <Suspense fallback={<PageLoader />}>
                  <SalesPage />
                </Suspense>
              }
            />
            <Route
              path="statistics/history/branches"
              element={
                <Suspense fallback={<PageLoader />}>
                  <HistoryBranchesPage />
                </Suspense>
              }
            />
            <Route
              path="statistics/history/customers"
              element={
                <Suspense fallback={<PageLoader />}>
                  <HistoryCustomersPage />
                </Suspense>
              }
            />
            <Route
              path="floor-plan"
              element={
                <Suspense fallback={<PageLoader />}>
                  <FloorPlanPage />
                </Suspense>
              }
            />
            <Route
              path="reservations"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ReservationsPage />
                </Suspense>
              }
            />
            <Route
              path="cash-register"
              element={
                <Suspense fallback={<PageLoader />}>
                  <CashRegisterPage />
                </Suspense>
              }
            />
            <Route
              path="tips"
              element={
                <Suspense fallback={<PageLoader />}>
                  <TipsPage />
                </Suspense>
              }
            />
            <Route
              path="fiscal"
              element={
                <Suspense fallback={<PageLoader />}>
                  <FiscalPage />
                </Suspense>
              }
            />
            <Route
              path="scheduling"
              element={
                <Suspense fallback={<PageLoader />}>
                  <SchedulingPage />
                </Suspense>
              }
            />
            <Route
              path="crm"
              element={
                <Suspense fallback={<PageLoader />}>
                  <CRMPage />
                </Suspense>
              }
            />
            <Route
              path="delivery"
              element={
                <Suspense fallback={<PageLoader />}>
                  <DeliveryPage />
                </Suspense>
              }
            />
            <Route
              path="audit-log"
              element={
                <Suspense fallback={<PageLoader />}>
                  <AuditLogPage />
                </Suspense>
              }
            />
            <Route
              path="settings"
              element={
                <Suspense fallback={<PageLoader />}>
                  <SettingsPage />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
