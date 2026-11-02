const PageLoading = () => (
    <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "55vh" }} role="status">
        <div className="text-center text-muted">
            <div className="spinner-border text-success mb-3" aria-hidden="true" />
            <p className="mb-0">Loading page...</p>
        </div>
    </div>
);

export default PageLoading;
