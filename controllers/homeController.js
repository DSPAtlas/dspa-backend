import HomeModel from '../models/homeModel.js';

class HomeController {
    static getHomePage(req, res) {
        const data = HomeModel.getHomePageData();
        res.json({ message: 'API Home' });
    }
    
    static handleSearch(req, res) {
        const { taxonomyID, proteinName } = req.query;
        res.redirect(`/api/v1/proteins?taxonomyID=${encodeURIComponent(taxonomyID)}&proteinName=${encodeURIComponent(proteinName)}`);
    }
}

export default HomeController;