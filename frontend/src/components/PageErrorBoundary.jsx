import { Component } from "react";

class PageErrorBoundary extends Component {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    render() {
        if (this.state.failed) {
            return (
                <div className="alert alert-warning my-4" role="alert">
                    <h2 className="h5">This page could not load.</h2>
                    <p>Refresh the CRM to get the latest version.</p>
                    <button className="btn btn-outline-dark" type="button" onClick={() => window.location.reload()}>
                        Refresh CRM
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default PageErrorBoundary;
